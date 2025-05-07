import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';
import type { Database } from '@/types/supabase'; // Import Database type

// Define table types locally
type Call = Database['public']['Tables']['calls']['Row'];
type CallInsert = Database['public']['Tables']['calls']['Insert'];
type CallUpdate = Database['public']['Tables']['calls']['Update'];
type CommunicationInsert = Database['public']['Tables']['communications']['Insert'];

// Helper to format duration (ensure it exists)
function formatDuration(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export async function POST(request: Request) {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const twiml = new VoiceResponse();
  try {
    console.log('[/api/twilio/status] Status callback received');
    const formData = await request.formData();
    const callSid = formData.get('CallSid') as string;
    const callStatus = formData.get('CallStatus') as string;
    const parentCallSid = formData.get('ParentCallSid') as string | null;
    const recordingUrl = formData.get('RecordingUrl') as string | null;
    const recordingSid = formData.get('RecordingSid') as string | null;
    const callDuration = formData.get('CallDuration') as string | null;
    const twilioTimestamp = formData.get('Timestamp') as string | null;
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const direction = formData.get('Direction') as string;
    const clientIdentifier = formData.get('From')?.toString().startsWith('client:') 
                         ? formData.get('From')?.toString().substring(7) 
                         : (formData.get('To')?.toString().startsWith('client:') 
                            ? formData.get('To')?.toString().substring(7) 
                            : undefined); // Extract client UUID if present

    console.log('[/api/twilio/status] Details:', { 
      callSid, callStatus, parentCallSid, recordingUrl, recordingSid, 
      callDuration, twilioTimestamp, from, to, direction, clientIdentifier
    });

    // --- Find Existing Call Record --- 
    const { data: existingCall, error: findError } = await supabase
        .from('calls')
        .select('*')
        .eq('call_sid', callSid)
        .maybeSingle();

    if (findError) {
        console.error(`[/api/twilio/status] Error finding call record ${callSid}:`, findError);
        // Depending on the error, we might want to return early
        // For now, proceed to potentially create if it's a child call scenario
    }

    if (existingCall) {
        // --- Record Found: Update Existing --- 
        console.log(`[/api/twilio/status] Found existing record ${existingCall.id} for SID ${callSid}. Is Parent: ${existingCall.is_parent_call}`);
        await handleExistingCallUpdate(existingCall, callStatus, callDuration, recordingUrl, recordingSid, twilioTimestamp, clientIdentifier, supabase);
    } else if (parentCallSid) {
        // --- Record Not Found, BUT ParentCallSid Exists: CREATE CHILD RECORD --- 
        console.log(`[/api/twilio/status] Record for SID ${callSid} not found, but ParentCallSid ${parentCallSid} exists. Creating child record.`);
        await handleChildCallCreation(
            callSid, 
            parentCallSid, 
            callStatus, 
            from, 
            to, 
            direction, 
            callDuration, 
            recordingUrl, 
            recordingSid, 
            twilioTimestamp, 
            clientIdentifier, 
            supabase // Pass client
        );
    } else {
        // --- Record Not Found and NO ParentCallSid: Likely a direct call managed by Frontend --- 
        // The frontend (handleCallEnd) should have created this record.
        // If the status callback arrives first, we might miss updates.
        // Option 1: Log a warning and do nothing.
        // Option 2 (Chosen): Attempt a simple update based on callSid, assuming FE will create it.
        //              This allows capturing final duration/recording if this callback is last.
        console.warn(`[/api/twilio/status] Record for direct SID ${callSid} not found. Frontend should manage creation. Attempting minimal update.`);
        await handleDirectCallUpdate(callSid, callStatus, callDuration, recordingUrl, recordingSid, twilioTimestamp, supabase);
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[/api/twilio/status] Error processing status callback:', message);
    // Still return TwiML to acknowledge Twilio
  }
  
  return new NextResponse(twiml.toString(), { headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
}

// --- Handler Functions --- 

async function handleExistingCallUpdate(
    existingCall: Call, 
    callStatus: string,
    callDuration: string | null,
    recordingUrl: string | null, 
    recordingSid: string | null, 
    twilioTimestamp: string | null, 
    clientIdentifier: string | undefined,
    supabase: SupabaseClient<Database>
) {
    console.log(`[/api/twilio/status Update] Updating existing call ${existingCall.id} (SID: ${existingCall.call_sid}, Parent: ${existingCall.is_parent_call})`);
    
    const updateData: CallUpdate = {
        status: callStatus,
        updated_at: twilioTimestamp ? new Date(twilioTimestamp).toISOString() : new Date().toISOString(),
    };
    let needsUpdate = existingCall.status !== callStatus;

    const newDuration = callDuration ? parseInt(callDuration, 10) : null;
    if ((callStatus === 'completed' || callStatus === 'failed' || callStatus === 'canceled' || callStatus === 'no-answer' || callStatus === 'busy')) {
        if (newDuration !== null && newDuration >= 0 && newDuration !== existingCall.duration) {
            updateData.duration = newDuration;
            needsUpdate = true;
        }
        if (!existingCall.ended_at) {
            updateData.ended_at = twilioTimestamp ? new Date(twilioTimestamp).toISOString() : new Date().toISOString(); 
            needsUpdate = true;
        }
    }

    if (recordingUrl !== undefined && recordingUrl !== existingCall.recording_url) {
        updateData.recording_url = recordingUrl;
        updateData.recording_sid = recordingSid;
        needsUpdate = true;
    }

    if (clientIdentifier && !existingCall.to_user_id && (callStatus === 'in-progress' || callStatus === 'answered' || callStatus === 'completed')) {
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('id', clientIdentifier)
            .maybeSingle();
        if (userError) {
            console.error(`[/api/twilio/status Update] Error looking up potential agent user ID ${clientIdentifier}:`, userError);
        } else if (userData) {
            if (userData.id !== existingCall.to_user_id) {
                updateData.to_user_id = userData.id;
                console.log(`[/api/twilio/status Update] Setting to_user_id for ${existingCall.id} to ${userData.id}`);
                needsUpdate = true;
            }
        } else {
             console.warn(`[/api/twilio/status Update] No user found for client identifier: ${clientIdentifier}`);
        }
    }

    if (needsUpdate) {
        console.log(`[/api/twilio/status Update] Applying update to call ${existingCall.id}:`, JSON.stringify(updateData));
        const { data: updatedCall, error: updateError } = await supabase
            .from('calls')
            .update(updateData)
            .eq('id', existingCall.id)
            .select()
            .single();

        if (updateError) {
            console.error(`[/api/twilio/status Update] Error updating call ${existingCall.id}:`, updateError);
        } else if (updatedCall) {
            console.log(`[/api/twilio/status Update] Successfully updated call ${updatedCall.id}.`);
            if (updatedCall.status === 'completed' && updatedCall.is_parent_call === false) {
                await createCommunicationRecordIfNeeded(updatedCall, supabase);
            }
        }
    } else {
         console.log(`[/api/twilio/status Update] No changes needed for call ${existingCall.id}.`);
    }
}

async function handleDirectCallUpdate(
    callSid: string, 
    callStatus: string,
    callDuration: string | null,
    recordingUrl: string | null, 
    recordingSid: string | null, 
    twilioTimestamp: string | null, 
    supabase: SupabaseClient<Database>
) {
    // Minimal update attempt for calls likely managed by FE
    const updateData: Partial<CallUpdate> = {
        status: callStatus,
        updated_at: twilioTimestamp ? new Date(twilioTimestamp).toISOString() : new Date().toISOString(),
    };

    const newDuration = callDuration ? parseInt(callDuration, 10) : null;
    if ((callStatus === 'completed' || callStatus === 'failed' || callStatus === 'canceled' || callStatus === 'no-answer' || callStatus === 'busy')) {
        if (newDuration !== null && newDuration >= 0) {
            updateData.duration = newDuration;
        }
        updateData.ended_at = twilioTimestamp ? new Date(twilioTimestamp).toISOString() : new Date().toISOString(); 
    }

    if (recordingUrl !== undefined) { // Allow setting null
        updateData.recording_url = recordingUrl;
        updateData.recording_sid = recordingSid;
    }
    
    const { data: updatedCall, error: updateError } = await supabase
        .from('calls')
        .update(updateData)
        .eq('call_sid', callSid) // Match by SID
        .select()
        .maybeSingle(); // Use maybeSingle as the record might not exist

    if (updateError) {
        console.error(`[TwiML Direct Update] Error updating potential direct call SID ${callSid}:`, updateError);
    } else if (updatedCall) {
        console.log(`[TwiML Direct Update] Successfully updated potential direct call ${updatedCall.id}.`);
        // Create communication record if completed (assuming FE set user IDs)
        if (updatedCall.status === 'completed' && updatedCall.is_parent_call !== true) { // Double check it wasn't somehow a parent
            await createCommunicationRecordIfNeeded(updatedCall, supabase);
        }
    } else {
         console.log(`[TwiML Direct Update] Update for SID ${callSid} did not match any existing record (expected if FE handles).`);
    }
}

// --- ADD handleChildCallCreation function ---
async function handleChildCallCreation(
    callSid: string,
    parentCallSid: string,
    callStatus: string,
    from: string,
    to: string,
    direction: string,
    callDuration: string | null,
    recordingUrl: string | null,
    recordingSid: string | null,
    twilioTimestamp: string | null,
    clientIdentifier: string | undefined,
    supabase: SupabaseClient<Database>
) {
    console.log(`[/api/twilio/status ChildCreate] Handling CHILD call creation for SID ${callSid}, Parent SID ${parentCallSid}`);

    // --- Fetch Parent Record to get group_id --- 
    let parentGroupId: string | null = null;
    try {
      const { data: parentRecord, error: parentError } = await supabase
        .from('calls')
        .select('group_id') // Select only the needed field
        .eq('call_sid', parentCallSid)
        .maybeSingle(); // Use maybeSingle as parent might not exist (edge case)

      if (parentError) {
        console.error(`[/api/twilio/status ChildCreate] Error fetching parent record (${parentCallSid}) for child ${callSid}:`, parentError);
        // Proceed without group_id if fetch fails, but log error
      } else if (parentRecord) {
        parentGroupId = parentRecord.group_id;
        console.log(`[/api/twilio/status ChildCreate] Found parent record ${parentCallSid}, group_id: ${parentGroupId}`);
      } else {
        console.warn(`[/api/twilio/status ChildCreate] Parent record (${parentCallSid}) not found for child ${callSid}. Child group_id will be null.`);
      }
    } catch (lookupError) {
      console.error(`[/api/twilio/status ChildCreate] Exception fetching parent record (${parentCallSid}):`, lookupError);
    }

    // --- Determine Agent ID --- 
    let agentUserId: string | null = null;
    if (clientIdentifier) {
        const { data: userData, error: userError } = await supabase
            .from('users').select('id').eq('id', clientIdentifier).maybeSingle();
        if (userError) {
            console.error(`[/api/twilio/status ChildCreate] Error looking up agent ${clientIdentifier}:`, userError);
        } else if (userData) {
            agentUserId = userData.id;
            console.log(`[/api/twilio/status ChildCreate] Found agent user ID: ${agentUserId}`);
        } else {
            console.warn(`[/api/twilio/status ChildCreate] Agent user ID not found for client: ${clientIdentifier}`);
        }
    }

    // --- Prepare Insert Data --- 
    const newDuration = callDuration ? parseInt(callDuration, 10) : null;
    const startedAt = twilioTimestamp ? new Date(twilioTimestamp).toISOString() : new Date().toISOString(); // Approximate start if timestamp missing
    const endedAt = (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'canceled') ? startedAt : null; // Set ended_at if completed on creation

    const insertData: CallInsert = {
        call_sid: callSid,
        parent_call_sid: parentCallSid, // Link to parent
        is_parent_call: false, // Explicitly child
        status: callStatus,
        from_number: from,
        to_number: to,
        group_id: parentGroupId, // Use ID fetched from parent
        direction: direction, // Use direction from Twilio webhook
        to_user_id: agentUserId, // The agent who answered
        // from_user_id might be null if external caller not in DB
        started_at: startedAt, 
        duration: (newDuration !== null && newDuration >= 0) ? newDuration : null,
        ended_at: endedAt,
        recording_url: recordingUrl,
        recording_sid: recordingSid,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    console.log('[/api/twilio/status ChildCreate] Inserting child call record:', JSON.stringify(insertData));

    // --- Insert Record --- 
    const { data: newCall, error: createError } = await supabase
        .from('calls')
        .insert(insertData)
        .select() // Select the inserted record
        .single();

    if (createError) {
        console.error(`[/api/twilio/status ChildCreate] Error creating child call record for SID ${callSid}:`, createError);
    } else if (newCall) {
        console.log(`[/api/twilio/status ChildCreate] Successfully created child call record ${newCall.id}.`);
        // Create communication record if completed immediately
        if (newCall.status === 'completed') {
            await createCommunicationRecordIfNeeded(newCall, supabase);
        }
    }
}
// --- END ADD ---

async function createCommunicationRecordIfNeeded(finalCallData: Call, supabase: SupabaseClient<Database>) { 
    // Only create if the call has user IDs assigned (likely by frontend)
    if (!finalCallData.from_user_id && !finalCallData.to_user_id) {
        console.log(`[Comm Record] Skipping communication for call ${finalCallData.id} - missing user IDs.`);
        return;
    }
    
    // Check if a communication record already exists for this call ID
    const { data: existingComm, error: checkError } = await supabase
        .from('communications')
        .select('id')
        .eq('communication_type', 'call')
        .eq('communication_type_id', finalCallData.id)
        .maybeSingle();

    if (checkError) {
        console.error(`[Comm Record] Error checking for existing communication for call ${finalCallData.id}:`, checkError);
        return; // Don't proceed if check fails
    }

    if (existingComm) {
        console.log(`[Comm Record] Communication record already exists for call ${finalCallData.id}. Skipping creation.`);
        return;
    }
    
    // Proceed with creation if no existing record found
    console.log(`[/api/twilio/status Comm Record] Creating communication record for completed call ${finalCallData.id}`);

    // Determine user_id (external party) and agent_id (internal party)
    // Use the IDs directly from the call record (expected to be set by handleCallEnd)
    const externalUserId = finalCallData.direction === 'inbound' 
        ? finalCallData.from_user_id 
        : finalCallData.to_user_id;
    const agentId = finalCallData.direction === 'inbound' 
        ? finalCallData.to_user_id 
        : finalCallData.from_user_id;

    const communicationInsertData: CommunicationInsert = {
        direction: finalCallData.direction,
        to_address: finalCallData.to_number,
        from_address: finalCallData.from_number,
        delivered_at: finalCallData.ended_at || finalCallData.updated_at || new Date().toISOString(), // Use ended_at if available
        // Refine content based on availability of details
        content: `Call ${finalCallData.status || '-'}. Duration: ${formatDuration(finalCallData.duration)}. ${finalCallData.recording_url ? `Recording available.` : ''}`,
        communication_type: 'call',
        communication_type_id: finalCallData.id,
        agent_id: agentId, // Use agent ID from call record
        user_id: externalUserId // Use external user ID from call record
    };

    console.log('[Comm Record] Communication insert data:', JSON.stringify(communicationInsertData, null, 2));

    const { error: commError } = await supabase
        .from('communications')
        .insert(communicationInsertData);

    if (commError) {
        console.error(`[Comm Record] Error inserting communication record for call ${finalCallData.id}:`, commError);
    } else {
        console.log(`[Comm Record] Successfully created communication record for call ${finalCallData.id}`);
    }
} 