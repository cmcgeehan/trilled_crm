import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';
import type { Database } from '@/types/supabase'; // Import Database type

// Define table types locally
type Call = Database['public']['Tables']['calls']['Row'];
type CallUpdate = Database['public']['Tables']['calls']['Update'];
type CommunicationInsert = Database['public']['Tables']['communications']['Insert'];

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  const twiml = new VoiceResponse();
  try {
    console.log('Status callback received');
    const formData = await request.formData();
    const callSid = formData.get('CallSid') as string;
    const callStatus = formData.get('CallStatus') as string;
    const called = formData.get('Called') as string; // Might be group # or client ID if direct
    const from = formData.get('From') as string;
    const client = formData.get('Client') as string; // Twilio Client identifier (user who answered)
    const recordingUrl = formData.get('RecordingUrl') as string;
    const recordingStatus = formData.get('RecordingStatus') as string;
    const recordingSid = formData.get('RecordingSid') as string;
    const callDuration = formData.get('CallDuration') as string;
    const parentCallSid = formData.get('ParentCallSid') as string; // Not currently used, but good to have
    const url = new URL(request.url);
    const fromNumberParam = url.searchParams.get('fromNumber'); // Passed from inbound
    
    console.log('Status details:', { 
      callSid, callStatus, called, from, fromNumberParam, client, 
      recordingUrl, recordingStatus, recordingSid, callDuration, parentCallSid
    });
    console.log('All form data:', Object.fromEntries(formData.entries()));

    // --- Find the Call Record --- 
    try {
        // 1. Try finding by direct CallSid
        const { data: directCallRecord, error: directError } = await supabase
            .from('calls')
            .select('*')
            .eq('call_sid', callSid)
            .maybeSingle();

        if (directError) {
            console.error(`Error fetching direct call record ${callSid}:`, directError);
        }

        if (directCallRecord) {
            // --- Record Found by Direct SID --- 
            console.log(`Processing update for direct call record ${directCallRecord.id} (SID: ${callSid})`);
            // Pass formData to the helper
            await processTwimlUpdate(directCallRecord, callStatus, callDuration, recordingUrl, recordingSid, new Date().toISOString(), client, formData);
        
        } else if (parentCallSid) {
            // --- Not found by Direct SID, Try Parent SID ---
            console.log(`Direct SID ${callSid} not found. Checking ParentCallSid: ${parentCallSid}`);
            const { data: parentCallRecord, error: parentError } = await supabase
                .from('calls')
                .select('*')
                .eq('call_sid', parentCallSid)
                .maybeSingle();

            if (parentError) {
                console.error(`Error fetching parent call record ${parentCallSid}:`, parentError);
            }

            if (parentCallRecord) {
                // --- Record Found by Parent SID --- 
                console.log(`Processing update for parent call record ${parentCallRecord.id} (found via Parent SID ${parentCallSid} from child ${callSid})`);
                 // Pass formData to the helper
                await processTwimlUpdate(parentCallRecord, callStatus, callDuration, recordingUrl, recordingSid, new Date().toISOString(), client, formData);
            } else {
                // --- No Record Found (Parent SID) --- 
                console.error(`[TwiML Status] Callback received, but no matching call record found for SID ${callSid} or Parent SID ${parentCallSid}.`);
            }
        } else {
            // --- No Record Found (No Parent SID) --- 
            console.error(`[TwiML Status] Callback received, but no matching call record found for SID ${callSid} and no Parent SID provided.`);
        }

    } catch (error) {
       const message = error instanceof Error ? error.message : String(error);
       console.error('[TwiML Status Callback] Unexpected error during DB lookup:', message);
    }

    // Always acknowledge Twilio with TwiML response
    return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-cache' },
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[/api/twiml/status] Outer endpoint error:', message);
    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-cache'
      },
    });
  }
}

// --- Helper Function to Process Updates --- 
async function processTwimlUpdate(
  callRecord: Call, // Accepts the non-null record
  callStatus: string,
  callDuration: string | undefined,
  recordingUrl: string | undefined,
  recordingSid: string | undefined, // Keep param even if not in DB table type
  timestamp: string | undefined,
  client: string | undefined, // Twilio Client Identifier
  formData: FormData // Pass formData to access original From/Called numbers
) {
  try {
      const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      const targetCallSid = callRecord.call_sid!; // Assert non-null
      // Get original numbers from formData if available, otherwise use record
      const fromNumber = formData.get('From') as string || callRecord.from_number;
      const toNumber = formData.get('Called') as string || callRecord.to_number;

      console.log(`[processTwimlUpdate] Call SID: ${targetCallSid}, Received Status: ${callStatus}, Received RecordingURL: ${recordingUrl}`);

      // Prepare update data
      const updateData: CallUpdate = {
          status: callStatus,
          updated_at: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
          // Ensure numbers are updated if they were missing initially
          from_number: fromNumber,
          to_number: toNumber,
          duration: undefined,
          recording_url: undefined,
          to_user_id: callRecord.to_user_id // Preserve existing user_id unless overwritten
      };
      let answeringUserId: string | null = callRecord.to_user_id || null; // Default to existing if already set

      // Logic to find answeringUserId based on the 'client' who answered
      if ((callStatus === 'in-progress' || callStatus === 'answered' || callStatus === 'completed') && client) {
          console.log(`Call ${targetCallSid} answered/handled by client: ${client}. Looking up user...`);
          const { data: userData, error: userError } = await supabase
              .from('users')
              .select('id')
              // Assuming client identifier format is 'client:USER_UUID' based on potential Twilio config
              .eq('id', client.startsWith('client:') ? client.substring(7) : client) 
              .maybeSingle(); 
          if (userError) {
              console.error(`Error looking up user for client ${client}:`, userError);
          } else if (userData) {
              answeringUserId = userData.id;
              console.log(`Found answering user ${answeringUserId} for client ${client}`);
              updateData.to_user_id = answeringUserId; // Update the agent who handled the call
          } else {
               console.warn(`No user found for answering client identifier: ${client}`);
               // Optionally keep the original to_user_id if lookup fails
               updateData.to_user_id = callRecord.to_user_id; 
          }
      }

      // Add completion data
      if (callStatus === 'completed') {
          console.log(`[processTwimlUpdate] Status is 'completed' for SID: ${targetCallSid}. Applying completion data.`);
          if (callDuration) updateData.duration = parseInt(callDuration, 10);
          if (recordingUrl) {
              console.log(`[processTwimlUpdate] RecordingUrl found: ${recordingUrl}. Adding to updateData.`);
              updateData.recording_url = recordingUrl;
          } else {
              console.log(`[processTwimlUpdate] No RecordingUrl received in this callback for SID: ${targetCallSid}.`);
          }
      }

      // Perform the update
      console.log(`[processTwimlUpdate] Preparing to update call ${callRecord.id} (SID: ${targetCallSid}) with data:`, JSON.stringify(updateData, null, 2));

      const { error: updateError } = await supabase
          .from('calls')
          .update(updateData)
          .eq('call_sid', targetCallSid);

      if (updateError) {
          console.error(`[processTwimlUpdate] Error updating call record ${callRecord.id} for SID ${targetCallSid}:`, JSON.stringify(updateError, null, 2));
      } else {
          console.log(`[processTwimlUpdate] Successfully updated call record ${callRecord.id} (SID: ${targetCallSid})`);
      }

      // Create Communication Record if completed
      if (callStatus === 'completed') {
          // Fetch the potentially updated call data AFTER the update
          const { data: finalCallData, error: fetchFinalError } = await supabase
              .from('calls')
              .select('*')
              .eq('call_sid', targetCallSid)
              .single();

          if (fetchFinalError || !finalCallData) {
              console.error(`Error fetching final call data for ${targetCallSid} after update:`, fetchFinalError);
              // Fallback to using combined data if fetch fails
              const fallbackFinalData = { ...callRecord, ...updateData };
              await createCommunicationRecord(fallbackFinalData, supabase);
          } else {
              await createCommunicationRecord(finalCallData, supabase);
          }
      }
  } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[processTwimlUpdate] Error processing ${callRecord.call_sid}:`, message, error);
  }
}

// --- Helper function to create communication record ---
async function createCommunicationRecord(finalCallData: Call, supabase: SupabaseClient<Database>) { 
    try {
        console.log(`Creating communication record for completed call ${finalCallData.id}`);
        
        // Determine direction (explicitly check is_parent_call or rely on user IDs)
        const isOutbound = finalCallData.from_user_id && !finalCallData.to_user_id; // Heuristic, might need refinement
        const direction = isOutbound ? 'outbound' : 'inbound';

        // Determine agent_id (who handled the call)
        // For inbound, it's the user who answered (to_user_id)
        // For outbound, it's the user who initiated (from_user_id)
        const commAgentId = direction === 'inbound' ? finalCallData.to_user_id : finalCallData.from_user_id;

        // Determine user_id (the external party)
        // For inbound, find user associated with from_number
        // For outbound, find user associated with to_number
        let commUserId: string | null = null;
        const externalNumber = direction === 'inbound' ? finalCallData.from_number : finalCallData.to_number;

        if (externalNumber) {
            console.log(`Looking up external user for number: ${externalNumber}`);
            // TODO: Refine this lookup. Does 'user' table store external contacts? 
            // Or should we query a 'contacts' table? Assuming 'users' for now.
            // Need to handle phone number formatting (e.g., E.164)
            const { data: externalUser, error: userLookupError } = await supabase
                .from('users') // Replace 'users' with 'contacts' if appropriate
                .select('id')
                .eq('phone_number', externalNumber) // Ensure 'phone_number' column exists and format matches
                .maybeSingle();

            if (userLookupError) {
                console.error(`Error looking up user by phone ${externalNumber}:`, userLookupError);
            } else if (externalUser) {
                commUserId = externalUser.id;
                console.log(`Found external user ${commUserId} for number ${externalNumber}`);
            } else {
                console.log(`No external user found for number ${externalNumber}`);
            }
        } else {
            console.warn(`Cannot determine external user ID: external number is missing for call ${finalCallData.id}`);
        }

        const communicationData: CommunicationInsert = {
            direction: direction,
            to_address: finalCallData.to_number, // Number dialed/received
            from_address: finalCallData.from_number, // Number calling from
            delivered_at: new Date(finalCallData.updated_at || Date.now()).toISOString(), // Use call end time
            content: `${finalCallData.group_id ? 'Group p' : 'P'}hone call ${finalCallData.recording_url ? `(Recording: ${finalCallData.recording_url})` : ''}`,
            communication_type: 'call',
            communication_type_id: finalCallData.id,
            agent_id: commAgentId, // The internal agent/user handling the call
            user_id: commUserId, // The external user/contact involved
        };

        console.log('Communication insert data:', communicationData);
        const { error: commError } = await supabase
            .from('communications')
            .insert(communicationData);

        if (commError) {
            console.error(`Error creating communication record for call ${finalCallData.id}:`, commError);
        } else {
            console.log(`Successfully created communication record for call ${finalCallData.id}`);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[createCommunicationRecord] Error for call ${finalCallData.id}:`, message);
    }
} 