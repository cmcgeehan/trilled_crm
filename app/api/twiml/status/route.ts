import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';
import type { Database } from '@/types/supabase'; // Import Database type

// Define table types locally
type Call = Database['public']['Tables']['calls']['Row'];
type CallInsert = Database['public']['Tables']['calls']['Insert'];
type CallUpdate = Database['public']['Tables']['calls']['Update'];
type CommunicationInsert = Database['public']['Tables']['communications']['Insert'];

// Initialize Supabase client
const supabase = createClient<Database>(
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
    const called = formData.get('Called') as string; // Twilio number dialed FROM (can be group#)
    const to = formData.get('To') as string; // Destination number/client dialed TO
    const from = formData.get('From') as string; // Originating number/client
    const direction = formData.get('Direction') as string; // e.g., outbound-api, inbound
    const client = formData.get('From')?.toString().startsWith('client:') 
                   ? formData.get('From') as string 
                   : (formData.get('To')?.toString().startsWith('client:') 
                      ? formData.get('To') as string 
                      : undefined); // Twilio Client identifier if involved

    const recordingUrl = formData.get('RecordingUrl') as string;
    const recordingSid = formData.get('RecordingSid') as string;
    const callDuration = formData.get('CallDuration') as string;
    const parentCallSid = formData.get('ParentCallSid') as string;
    const twilioTimestamp = formData.get('Timestamp') as string; // Get Twilio's timestamp
    
    console.log('Status details:', { 
      callSid, callStatus, called, to, from, direction, client, 
      recordingUrl, recordingStatus: formData.get('RecordingStatus'), recordingSid, callDuration, parentCallSid,
      twilioTimestamp // Log Twilio's timestamp
    });
    // console.log('All form data:', Object.fromEntries(formData.entries()));

    // --- Find or Create Call Record --- 
    let callRecord: Call | null = null;
    let recordExisted = false;
    try {
        // 1. Try finding by CallSid provided in the callback
        const { data: existingRecord, error: findError } = await supabase
            .from('calls')
            .select('*')
            .eq('call_sid', callSid)
            .maybeSingle();

        if (findError) {
            console.error(`[TwiML Status] Error finding call record ${callSid}:`, findError);
            // Continue attempt to create if necessary
        }

        if (existingRecord) {
            console.log(`[TwiML Status] Found existing call record ${existingRecord.id} for SID ${callSid}`);
            callRecord = existingRecord;
            recordExisted = true;
        } else {
            console.log(`[TwiML Status] No existing record found for SID ${callSid}. Checking if creation is needed...`);
            // If no record, AND this looks like an early status for an outbound client call,
            // potentially create a placeholder record.
            // We only create if we get essential info early (like recordingUrl or specific status)
            // Let's primarily rely on the frontend to create the full record.
            // However, we *must* handle the recordingUrl if it arrives before the record exists.
            // A potential strategy (complex) could be to temporarily store the recordingUrl elsewhere (e.g., cache)
            // keyed by callSid and apply it later.
            
            // --- Simplified approach: Assume record *will* exist eventually --- 
            // We won't create here, but the update logic below will handle adding recordingUrl whenever it comes.
             console.log(`[TwiML Status] Record for SID ${callSid} not found. Frontend should create it. Update will be attempted.`);
            // If the record *never* gets created by frontend, this update will silently fail.
            // If recordingUrl arrives *after* frontend creates, it will be updated.
            callRecord = {
                id: 'temp-' + callSid, // Placeholder ID, will be ignored by upsert
                call_sid: callSid,
                status: callStatus,
                from_number: from || '', // Ensure non-null string
                to_number: to || '', // Ensure non-null string
                direction: null, 
                started_at: null, 
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                // Initialize other nullable fields from Call/Row type to null
                // parent_call_sid: parentCallSid || null, // Removed: Not expected by Call type?
                // is_parent_call: false, // Removed: Not expected by Call type?
                from_user_id: null,
                to_user_id: null,
                group_id: null,
                ended_at: null,
                duration: null,
                recording_url: null
            } satisfies Call; // Use 'satisfies' for better type checking without casting
        }

        // --- Process Update --- 
        if (callRecord) {
            await processTwimlUpdate(
                callRecord, 
                callStatus, 
                callDuration, 
                recordingUrl, 
                recordingSid, 
                twilioTimestamp, // Pass Twilio's timestamp
                client, 
                formData,
                recordExisted // Pass flag indicating if record was found or is placeholder
            );
        } else {
             // This case should ideally not be reached with the placeholder logic
            console.error(`[TwiML Status] Failed to find or create placeholder for SID ${callSid}. Update skipped.`);
        }

    } catch (error) {
       const message = error instanceof Error ? error.message : String(error);
       console.error('[TwiML Status] Error during DB lookup/processing:', message);
    }

    // Always acknowledge Twilio
    return new NextResponse(twiml.toString(), { headers: { 'Content-Type': 'text/xml; charset=utf-8' } });

  } catch (error) {
    // ... Outer error handling ...
    console.error('[/api/twiml/status] Outer endpoint error:', error);
    return new NextResponse(twiml.toString(), { headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
  }
}

// --- Helper Function to Process Updates --- 
async function processTwimlUpdate(
  callRecord: Call, 
  callStatus: string,
  callDuration: string | undefined,
  recordingUrl: string | undefined, 
  recordingSid: string | undefined, 
  twilioTimestamp: string | undefined, // Receive Twilio's timestamp
  client: string | undefined, 
  formData: FormData,
  recordExisted: boolean // Flag to know if we are updating real record or placeholder
) {
  try {
      const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      const targetCallSid = callRecord.call_sid!; 
      const fromNumber = formData.get('From') as string || callRecord.from_number;
      const toNumber = formData.get('To') as string || callRecord.to_number; // Use 'To' from formData

      console.log(`[processTwimlUpdate] SID: ${targetCallSid}, Status: ${callStatus}, RecordingURL: ${recordingUrl}, RecordExisted: ${recordExisted}`);

      // Prepare base update data, always include status and timestamp
      const updateData: CallUpdate = {
          status: callStatus,
          // Use Twilio's timestamp if available, otherwise use current time
          updated_at: twilioTimestamp ? new Date(twilioTimestamp).toISOString() : new Date().toISOString(), 
          // Only include fields known to be potentially updated by status callback
      };

      // Add recording URL if present in this callback, regardless of status
      if (recordingUrl) {
          console.log(`[processTwimlUpdate] RecordingUrl found: ${recordingUrl}. Adding to updateData.`);
          updateData.recording_url = recordingUrl;
      } else {
          // Log if it's missing, especially on completed status
          if (callStatus === 'completed') {
             console.log(`[processTwimlUpdate] Completed status for ${targetCallSid} but NO RecordingUrl in this callback.`);
          }
      }
      
      // Add duration if call is completed
      if (callStatus === 'completed') {
          console.log(`[processTwimlUpdate] Status is 'completed' for SID: ${targetCallSid}.`);
          if (callDuration) {
              updateData.duration = parseInt(callDuration, 10);
              console.log(`[processTwimlUpdate] Duration ${updateData.duration} added.`);
          }
          // Add ended_at timestamp on completion
          // Use Twilio's timestamp if available, otherwise use current time
          updateData.ended_at = twilioTimestamp ? new Date(twilioTimestamp).toISOString() : new Date().toISOString(); 
          console.log(`[processTwimlUpdate] Ended_at ${updateData.ended_at} added.`);
      }
      
      // Add answering user ID for inbound calls (only update if needed)
      if (client && callRecord.direction === 'inbound' && (callStatus === 'in-progress' || callStatus === 'answered' || callStatus === 'completed')) {
          console.log(`[processTwimlUpdate] Inbound call ${targetCallSid} answered/handled by client: ${client}. Looking up user...`);
          const { data: userData, error: userError } = await supabase
              .from('users')
              .select('id')
              .eq('id', client.startsWith('client:') ? client.substring(7) : client) 
              .maybeSingle(); 
          if (userError) {
              console.error(`Error looking up answering user for client ${client}:`, userError);
          } else if (userData && userData.id !== callRecord.to_user_id) { // Only update if different
              console.log(`Found answering user ${userData.id} for client ${client}. Updating to_user_id.`);
              updateData.to_user_id = userData.id; 
          } else if (userData) {
             console.log(`Answering user ${userData.id} already matches record.to_user_id.`);
          } else {
               console.warn(`No user found for answering client identifier: ${client}`);
          }
      }

      // Perform the UPSERT operation
      // This will UPDATE the record if it exists (based on call_sid), 
      // or INSERT if it doesn't exist (relevant if FE creation is delayed/fails)
      // Note: This requires call_sid to be unique constraint or PK
      console.log(`[processTwimlUpdate] Preparing to upsert call SID ${targetCallSid} with data:`, JSON.stringify(updateData, null, 2));
      
      // Construct the full record for insertion in case it doesn't exist
      // Merge existing placeholder/fetched data with new update data
      const recordForUpsert: CallInsert = {
        // Fields required or typically set on insert/initial state
        call_sid: targetCallSid,
        status: updateData.status || callRecord.status || 'unknown',
        from_number: fromNumber,
        to_number: toNumber,
        direction: callRecord.direction || (recordExisted ? null : 'unknown'), // Try to preserve existing direction, or mark as unknown if placeholder
        started_at: callRecord.started_at || (recordExisted ? null : new Date().toISOString()), // Try to preserve existing start, or set placeholder start
        created_at: callRecord.created_at || new Date().toISOString(), // Preserve original create or set new
        
        // Fields potentially updated by status callback (from updateData)
        updated_at: updateData.updated_at || new Date().toISOString(),
        recording_url: updateData.recording_url !== undefined ? updateData.recording_url : callRecord.recording_url,
        duration: updateData.duration !== undefined ? updateData.duration : callRecord.duration,
        ended_at: updateData.ended_at !== undefined ? updateData.ended_at : callRecord.ended_at,
        
        // User/Group IDs (prioritize updateData if available, else callRecord)
        from_user_id: callRecord.from_user_id, // Typically set by outbound route, not status callback
        to_user_id: updateData.to_user_id !== undefined ? updateData.to_user_id : callRecord.to_user_id,
        group_id: callRecord.group_id, // Typically set by inbound route, not status callback
        
        // Fields from Row type not in Insert type (like id, is_parent_call) are omitted
      };

      // Clean up nullish values that shouldn't overwrite existing data during upsert
      // Supabase upsert might treat explicit null differently than missing key
      Object.keys(recordForUpsert).forEach(key => {
        if (recordForUpsert[key as keyof CallInsert] === undefined || recordForUpsert[key as keyof CallInsert] === null) {
          // We might want fine-grained control here, for now let's keep explicit nulls
          // if they were intentionally set (e.g. recording_url might become null)
          // delete recordForUpsert[key as keyof CallInsert]; // Option to remove null/undefined
        }
      });

      console.log(`[processTwimlUpdate] Cleaned recordForUpsert:`, JSON.stringify(recordForUpsert, null, 2));

      const { error: upsertError } = await supabase
          .from('calls')
          .upsert(recordForUpsert, { onConflict: 'call_sid' })

      if (upsertError) {
          console.error(`[processTwimlUpdate] Error upserting call record for SID ${targetCallSid}:`, JSON.stringify(upsertError, null, 2));
      } else {
          console.log(`[processTwimlUpdate] Successfully upserted call record for SID ${targetCallSid}`);
      }

      // Create Communication Record ONLY if the call is truly completed in THIS callback
      // AND the record actually existed before this update (to avoid duplicates from FE)
      if (callStatus === 'completed' && recordExisted) {
          // Fetch the final data *after* the upsert to ensure consistency
          const { data: finalCallData, error: fetchFinalError } = await supabase
              .from('calls')
              .select('*')
              .eq('call_sid', targetCallSid)
              .single();

          if (fetchFinalError || !finalCallData) {
              console.error(`[processTwimlUpdate] Error fetching final call data for ${targetCallSid} after upsert:`, fetchFinalError);
              // Avoid creating comms record if we can't get final data
          } else {
              // Check if communication already exists for this call_id to prevent duplicates
              const { data: existingComm, error: checkCommError } = await supabase
                .from('communications')
                .select('id')
                .eq('communication_type', 'call')
                .eq('communication_type_id', finalCallData.id)
                .limit(1)
                .maybeSingle();
              
              if (checkCommError) {
                 console.error(`[processTwimlUpdate] Error checking for existing communication for call ${finalCallData.id}:`, checkCommError);
              } else if (!existingComm) {
                 console.log(`[processTwimlUpdate] No existing communication found for call ${finalCallData.id}. Creating one.`);
                 await createCommunicationRecord(finalCallData, supabase);
              } else {
                 console.log(`[processTwimlUpdate] Communication record already exists for call ${finalCallData.id}. Skipping creation.`);
              }
          }
      } else if (callStatus === 'completed' && !recordExisted) {
          console.log(`[processTwimlUpdate] Call completed for SID ${targetCallSid}, but record didn't exist prior. Frontend should handle communication creation.`);
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