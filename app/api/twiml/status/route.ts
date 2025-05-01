import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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
            // Pass necessary data to the helper
            await processTwimlUpdate(directCallRecord, callStatus, callDuration, recordingUrl, recordingSid, new Date().toISOString(), client);
        
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
                 // Pass necessary data to the helper
                await processTwimlUpdate(parentCallRecord, callStatus, callDuration, recordingUrl, recordingSid, new Date().toISOString(), client);
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
  client: string | undefined // Twilio Client Identifier
) {
  try {
      const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      const targetCallSid = callRecord.call_sid!; // Assert non-null
      console.log(`[processTwimlUpdate] Processing ${targetCallSid} with status ${callStatus}`);

      // Prepare update data
      const updateData: CallUpdate = {
          status: callStatus,
          updated_at: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
          duration: undefined,
          recording_url: undefined,
          to_user_id: undefined
      };
      let answeringUserId: string | null = null;

      // Logic to find answeringUserId
      if (callStatus === 'answered' && client) {
          console.log(`Call ${targetCallSid} answered by client: ${client}. Looking up user...`);
          const { data: userData, error: userError } = await supabase
              .from('users')
              .select('id')
              .eq('id', client) // Assuming client identifier IS the user_id
              .maybeSingle(); 
          if (userError) {
              console.error(`Error looking up user ${client}:`, userError);
          } else if (userData) {
              answeringUserId = userData.id;
              console.log(`Found answering user ${answeringUserId} for client ${client}`);
              updateData.to_user_id = answeringUserId; 
          } else {
               console.warn(`No user found for answering client identifier: ${client}`);
          }
      }

      // Add completion data
      if (callStatus === 'completed') {
          if (callDuration) updateData.duration = parseInt(callDuration, 10);
          if (recordingUrl) updateData.recording_url = recordingUrl;
          // Cannot update recording_sid if it doesn't exist in CallUpdate type
      }

      // Perform the update
      console.log(`Updating call ${callRecord.id} (SID: ${targetCallSid}) with data:`, updateData);
      const { error: updateError } = await supabase
          .from('calls')
          .update(updateData)
          .eq('call_sid', targetCallSid);

      if (updateError) {
          console.error(`Error updating call record ${callRecord.id} for SID ${targetCallSid}:`, updateError);
      }

      // Create Communication Record if completed
      if (callStatus === 'completed') {
          const finalCallData = { ...callRecord, ...updateData };
          const isOutbound = !finalCallData.to_user_id && !!finalCallData.from_user_id;
          const commAgentId = isOutbound ? finalCallData.from_user_id : finalCallData.to_user_id;
          // Placeholder - Requires lookup logic
          const commUserId = null; 

          console.log(`Creating communication record for completed call ${finalCallData.id}`);
          const communicationData: CommunicationInsert = {
              direction: isOutbound ? 'outbound' : 'inbound',
              to_address: finalCallData.to_number,
              from_address: finalCallData.from_number,
              delivered_at: new Date().toISOString(),
              content: `${finalCallData.group_id ? 'Group p' : (isOutbound ? 'P' : 'P')}hone call ${recordingUrl ? `(Recording: ${recordingUrl})` : ''}`,
              communication_type: 'call',
              communication_type_id: finalCallData.id,
              agent_id: commAgentId,
              user_id: commUserId,
          };

          console.log('Communication insert data:', communicationData);
          const { error: commError } = await supabase
              .from('communications')
              .insert(communicationData);

          if (commError) {
              console.error(`Error creating communication record for call ${finalCallData.id}:`, commError);
          }
      }
  } catch (processingError) {
      const message = processingError instanceof Error ? processingError.message : String(processingError);
      console.error(`[processTwimlUpdate] Error processing update for call SID ${callRecord.call_sid}:`, message);
  }
} 