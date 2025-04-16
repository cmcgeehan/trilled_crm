import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';

// Define a type for the expected call record structure (adjust properties as needed)
interface CallRecord {
  id: string;
  call_sid: string;
  from_user_id?: string | null;
  to_user_id?: string | null;
  from_number?: string | null;
  to_number?: string | null;
  group_id?: string | null;
  status?: string | null;
  duration?: number | null;
  recording_url?: string | null;
  started_at?: string | null;
  updated_at?: string | null;
  // Add any other relevant fields from your 'calls' table
}

// Define a type for the update data structure
interface CallUpdateData {
  status?: string;
  updated_at?: string;
  to_user_id?: string | null;
  duration?: number | null;
  recording_url?: string | null;
}

// Define a type for the communication data structure
interface CommunicationData {
  direction: string;
  to_address?: string | null;
  from_address?: string | null;
  delivered_at: string;
  agent_id?: string | null;
  user_id?: string | null;
  content: string;
  communication_type: string;
  communication_type_id: string;
}

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  const twiml = new VoiceResponse(); // Initialize TwiML response early
  try {
    console.log('[/api/twilio/status] Status callback received'); // Added identifier
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
    const parentCallSid = formData.get('ParentCallSid') as string;
    const url = new URL(request.url);
    const fromNumberParam = url.searchParams.get('fromNumber'); // Passed from inbound
    
    console.log('Status details:', { 
      callSid, callStatus, called, from, fromNumberParam, client, 
      recordingUrl, recordingStatus, recordingSid, callDuration, parentCallSid
    });
    console.log('All form data:', Object.fromEntries(formData.entries()));

    // --- Refactored Logic --- 
    // 1. Determine the correct Call SID to use for lookup.
    //    Status callbacks might come for the parent call or the child leg.
    let targetCallSid = callSid;
    let recordToUpdate: CallRecord | null = null;

    // Try finding the record with the received CallSid
    const { data: directCallRecord, error: directFetchError } = await supabase
      .from('calls')
      .select('*')
      .eq('call_sid', targetCallSid)
      .maybeSingle();

    if (directFetchError) {
      console.error(`Error fetching call record for SID ${targetCallSid}:`, directFetchError);
      // Potentially recoverable if ParentCallSid exists, so don't return yet
    }

    if (directCallRecord) {
      recordToUpdate = directCallRecord;
      // console.log(`Found existing call record ${recordToUpdate.id} using direct SID ${targetCallSid}`); // Moved log
    } else if (parentCallSid) {
      console.log(`Direct SID ${targetCallSid} not found in DB. Checking ParentCallSid: ${parentCallSid}`);
      targetCallSid = parentCallSid; 
      const { data: parentCallRecord, error: parentFetchError } = await supabase
        .from('calls')
        .select('*')
        .eq('call_sid', targetCallSid)
        .maybeSingle();
      
      if (parentFetchError) {
        console.error(`Error fetching call record for Parent SID ${targetCallSid}:`, parentFetchError);
        // If parent fetch also fails, we can probably error out
      } else if (parentCallRecord) {
        recordToUpdate = parentCallRecord;
        // console.log(`Found existing call record ${recordToUpdate.id} using Parent SID ${targetCallSid}`); // Moved log
      } 
    }

    // If no record found using either SID after all attempts, NOW log error and exit
    if (!recordToUpdate) {
      console.error(`Status callback received, but no matching call record found for SID ${callSid} or Parent SID ${parentCallSid || 'N/A'}.`);
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    }
    
    // --- recordToUpdate is now guaranteed non-null --- 
    // Log which record was found *after* the null check
    console.log(`Found existing call record ${recordToUpdate.id} using SID ${targetCallSid} (was parent: ${callSid !== targetCallSid})`);

    // --- Refactored Update Logic --- 
    // 2. Initialize Update Data
    const updateData: CallUpdateData = {
      status: callStatus, // Always update status and timestamp
      updated_at: new Date().toISOString(),
    };
    let answeringUserId: string | null = null; // Keep track if we find the user

    // 3. Check if we need to find the answering user (Child leg update)
    if (callSid !== targetCallSid && parentCallSid) {
      console.log('[DEBUG] --- Entered user lookup block! ---');
      console.log(`[INFO] Child leg ${callSid} callback (${callStatus}). Found parent in 'parentCallSid' param: ${parentCallSid}`);
      const lookupIdentifier = parentCallSid;
      console.log(`[INFO] Using lookup identifier from child leg 'parentCallSid' param: ${lookupIdentifier}`);
      const { data: answeringUser, error: userLookupError } = await supabase
        .from('users')
        .select('id') // Assuming the column is actually 'id' based on previous logs
        .eq('id', lookupIdentifier) // *** Check if 'id' is the correct column name in 'users' ***
        .maybeSingle(); 
      if (!userLookupError && answeringUser) {
          answeringUserId = answeringUser.id;
          updateData.to_user_id = answeringUserId; // Add to updateData NOW
          console.log(`[SUCCESS] Identified answering user ID (${answeringUserId}) from child leg 'parentCallSid' param. Added to updateData.`);
      } else if (userLookupError) {
          console.error(`[WARN] Error looking up user ID ${lookupIdentifier} from child leg 'parentCallSid' param:`, userLookupError);
      } else {
          console.warn(`[WARN] Could not find user for ID ${lookupIdentifier} from child leg 'parentCallSid' param.`);
      }
    }

    // 4. Check if we need to add completion data
    if (callStatus === 'completed') {
      console.log(`[INFO] Call completed status received.`);
      
      // Check Dial parameters from the main Dial action callback (if available)
      const dialCallStatus = formData.get('DialCallStatus') as string;
      const dialCallDuration = formData.get('DialCallDuration') as string;

      console.log(`[INFO] Dial parameters on completion: DialCallStatus=${dialCallStatus}, DialCallDuration=${dialCallDuration}`);

      // Use DialCallDuration if available, otherwise fallback to CallDuration from this callback
      const durationToUse = dialCallDuration || callDuration; 
      if (durationToUse) {
        updateData.duration = parseInt(durationToUse, 10);
        console.log(`[INFO] Adding duration: ${updateData.duration} (from ${dialCallDuration ? 'DialCallDuration' : 'CallDuration'}) to updateData`);
      } else {
        console.log(`[WARN] No duration found in DialCallDuration or CallDuration.`);
      }

      if (recordingUrl) {
        updateData.recording_url = recordingUrl;
        console.log(`[INFO] Adding recording URL: ${recordingUrl} to updateData`);
      }
    }

    // 5. Perform the single update operation
    console.log(`Updating call ${recordToUpdate.id} (SID: ${targetCallSid}) with consolidated data:`, updateData);
    const { error: updateError } = await supabase
      .from('calls')
      .update(updateData)
      .eq('call_sid', targetCallSid); 

    if (updateError) {
      console.error(`Error updating call record ${recordToUpdate.id} for SID ${targetCallSid}:`, updateError);
      // Decide if we should still proceed to create communication record
    }

    // 6. Create Communication Record if completed
    if (callStatus === 'completed') {
      // recordToUpdate is guaranteed non-null here
      console.log(`Creating communication record for completed call ${recordToUpdate.id}`);

      // Determine direction and assign user/agent IDs based on rules directly from recordToUpdate
      let direction: string;
      let commUserId: string | null = null;
      let commAgentId: string | null = null;
      
      // Use nullish coalescing for potentially undefined fields from recordToUpdate
      if (recordToUpdate.group_id) { 
        direction = 'inbound_group';
        commUserId = recordToUpdate.from_user_id ?? null; 
        commAgentId = recordToUpdate.to_user_id ?? null; 
        console.log('Call determined as INBOUND GROUP');
      } else if (recordToUpdate.from_user_id && (recordToUpdate.to_number ?? '').startsWith('+')) {
        direction = 'outbound';
        commUserId = recordToUpdate.to_user_id ?? null; 
        commAgentId = recordToUpdate.from_user_id ?? null;
        console.log('Call determined as OUTBOUND');
      } else {
        // Default case: Assume inbound direct call if not outbound and no group
        direction = 'inbound';
        commUserId = recordToUpdate.from_user_id ?? null;
        commAgentId = recordToUpdate.to_user_id ?? null;
        console.log('Call determined as INBOUND DIRECT');
      }

      // Use recordToUpdate directly, adding defaults for potentially missing fields
      const communicationData: CommunicationData = {
        direction: direction, 
        to_address: recordToUpdate.to_number ?? null, 
        from_address: recordToUpdate.from_number ?? null, 
        delivered_at: new Date().toISOString(),
        agent_id: commAgentId || null,   // Use calculated value
        user_id: commUserId || null,     // Use calculated value
        content: `${recordToUpdate.group_id ? 'Group p' : (direction === 'outbound' ? 'P' : 'P')}hone call ${recordingStatus === 'completed' ? `(Recording: ${recordingUrl})` : ''}`,
        communication_type: 'call',
        communication_type_id: recordToUpdate.id 
      };

      console.log('Communication insert data:', communicationData);

      const { error: commError } = await supabase
        .from('communications')
        .insert(communicationData);
      
      if (commError) {
        console.error(`Error creating communication record for call ${recordToUpdate.id}:`, commError);
      } else {
        console.log(`Successfully created communication record for call ${recordToUpdate.id}`);
      }
    }

    // 7. Return TwiML response (usually empty for status callbacks)
    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-cache'
      },
    });

  } catch (error) {
    console.error('[/api/twilio/status] Status endpoint error:', error); // Added identifier
    // Return empty TwiML even on unexpected errors
    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-cache'
      },
    });
  }
} 