import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    console.log('Status callback received');
    const formData = await request.formData();
    const callSid = formData.get('CallSid') as string;
    const callStatus = formData.get('CallStatus') as string;
    const called = formData.get('Called') as string;
    const from = formData.get('From') as string;
    const client = formData.get('Client') as string;
    const recordingUrl = formData.get('RecordingUrl') as string;
    const recordingStatus = formData.get('RecordingStatus') as string;
    const recordingSid = formData.get('RecordingSid') as string;
    const callDuration = formData.get('CallDuration') as string;
    const parentCallSid = formData.get('ParentCallSid') as string;
    const url = new URL(request.url);
    const fromNumberParam = url.searchParams.get('fromNumber');
    
    // Initialize TwiML response
    const twiml = new VoiceResponse();
    
    console.log('Status details:', { 
      callSid, 
      callStatus, 
      called, 
      from, 
      fromNumberParam, 
      recordingUrl,
      recordingStatus,
      recordingSid,
      callDuration,
      parentCallSid
    });

    // Log all form data for debugging
    console.log('All form data:', Object.fromEntries(formData.entries()));
    
    // First check if this is a direct call to a user
    const { data: directUser, error: userError } = await supabase
      .from('users')
      .select('id, twilio_phone')
      .eq('twilio_phone', called)
      .maybeSingle();
    
    if (userError) {
      console.error('Error finding user:', userError);
      return new NextResponse(twiml.toString(), {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
      });
    }

    // Check for existing call record
    const { data: existingCall, error: existingCallError } = await supabase
      .from('calls')
      .select('*')
      .eq('call_sid', callSid)
      .maybeSingle();

    if (existingCallError) {
      console.error('Error checking for existing call:', existingCallError);
    }

    // If we have an existing call, update it
    if (existingCall) {
      const { error: updateError } = await supabase
        .from('calls')
        .update({
          status: callStatus,
          duration: callDuration,
          recording_url: recordingUrl,
          updated_at: new Date().toISOString()
        })
        .eq('call_sid', callSid);

      if (updateError) {
        console.error('Error updating call record:', updateError);
      }

      return new NextResponse(twiml.toString(), {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
      });
    }

    // Only create a new call record if one doesn't exist
    const { error: createError } = await supabase
      .from('calls')
      .insert({
        call_sid: callSid,
        status: callStatus,
        from_number: fromNumberParam || from,
        to_number: called,
        started_at: new Date().toISOString()
      });

    if (createError) {
      console.error('Error creating call record:', createError);
    }
    
    if (directUser) {
      console.log('Found direct user:', directUser);
      
      // If the call is completed, create a communication record
      if (callStatus === 'completed' && existingCall) {
        const { error: commError } = await supabase
          .from('communications')
          .insert({
            direction: 'inbound',
            to_address: called,
            from_address: fromNumberParam || from,
            delivered_at: new Date().toISOString(),
            agent_id: directUser.id,
            user_id: directUser.id,
            content: `Phone call ${recordingStatus === 'completed' ? `(Recording: ${recordingUrl})` : ''}`,
            communication_type: 'call',
            communication_type_id: existingCall.id
          });
        
        if (commError) {
          console.error('Error creating communication record:', commError);
        }
      }
      
      return new NextResponse(twiml.toString(), {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
      });
    }
    
    // If not a direct call, check if it's a group call
    console.log('No direct user found, checking groups:', called);
    
    // Find the group associated with this number
    const { data: group, error: groupError } = await supabase
      .from('user_groups')
      .select('id, name, twilio_phone')
      .eq('twilio_phone', called)
      .maybeSingle();
    
    if (groupError) {
      console.error('Error finding group:', groupError);
      return new NextResponse(twiml.toString(), {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
      });
    }
    
    if (!group) {
      console.error('No group found for number:', called);
      return new NextResponse(twiml.toString(), {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
      });
    }
    
    console.log('Found group:', group);
    
    // Handle call status updates
    if (callStatus === 'initiated' || callStatus === 'ringing') {
      // Create new call record for incoming call
      const { error: createError } = await supabase
        .from('calls')
        .insert({
          twilio_call_sid: callSid,
          status: callStatus,
          from_number: fromNumberParam || from,
          to_number: called,
          group_id: group.id,
          started_at: new Date().toISOString()
        });
      
      if (createError) {
        console.error('Error creating call record:', createError);
      }
    } else if (callStatus === 'answered' && client) {
      const { data: answeringUser } = await supabase
        .from('users')
        .select('id')
        .eq('twilio_client_identifier', client)
        .single();

      if (answeringUser) {
        const { error: updateError } = await supabase
          .from('calls')
          .update({
            status: callStatus,
            to_user_id: answeringUser.id,
            updated_at: new Date().toISOString()
          })
          .eq('twilio_call_sid', callSid);

        if (updateError) {
          console.error('Error updating call with answering user:', updateError);
        }
      }
    } else if (callStatus === 'completed') {
      if (existingCall) {
        console.log('Successfully updated call to completed:', existingCall);
        
        // Create a communication record
        const { error: commError } = await supabase
          .from('communications')
          .insert({
            direction: 'inbound',
            to_address: called,
            from_address: from,
            delivered_at: new Date().toISOString(),
            agent_id: existingCall.to_user_id,
            user_id: existingCall.from_user_id,
            content: `Group phone call ${recordingStatus === 'completed' ? `(Recording: ${recordingUrl})` : ''}`,
            communication_type: 'call',
            communication_type_id: existingCall.id
          });
        
        if (commError) {
          console.error('Error creating communication record:', commError);
        } else {
          console.log('Successfully created communication record');
        }
      } else {
        console.error('No call record found for completed call:', callSid);
      }
    }
    
    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-cache'
      },
    });
  } catch (error) {
    console.error('Status endpoint error:', error);
    const twiml = new VoiceResponse();
    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-cache'
      },
    });
  }
} 