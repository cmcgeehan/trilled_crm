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
    const calledNumber = formData.get('Called') as string;
    const fromNumber = formData.get('From') as string;
    const url = new URL(request.url);
    const fromNumberParam = url.searchParams.get('fromNumber');
    
    console.log('Status details:', { callSid, callStatus, calledNumber, fromNumber, fromNumberParam });
    
    // First check if this is a direct call to a user
    const { data: directUser, error: userError } = await supabase
      .from('users')
      .select('id, twilio_phone')
      .eq('twilio_phone', calledNumber)
      .maybeSingle();
    
    if (userError) {
      console.error('Error finding user:', userError);
      const twiml = new VoiceResponse();
      return new NextResponse(twiml.toString(), {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
      });
    }
    
    if (directUser) {
      console.log('Found direct user:', directUser);
      
      // Update or create call record for this user
      const { error: updateError } = await supabase
        .from('calls')
        .upsert({
          call_sid: callSid,
          user_id: directUser.id,
          status: callStatus,
          from_number: fromNumberParam || fromNumber,
          to_number: calledNumber,
          updated_at: new Date().toISOString(),
        });
      
      if (updateError) {
        console.error('Error updating call record:', updateError);
      }
      
      const twiml = new VoiceResponse();
      return new NextResponse(twiml.toString(), {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
      });
    }
    
    // If not a direct call, check if it's a group call
    console.log('No direct user found, checking groups:', calledNumber);
    
    // Find the group associated with this number
    const { data: group, error: groupError } = await supabase
      .from('user_groups')
      .select('id')
      .eq('twilio_phone', calledNumber)
      .maybeSingle();
    
    if (groupError) {
      console.error('Error finding group:', groupError);
      const twiml = new VoiceResponse();
      return new NextResponse(twiml.toString(), {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
      });
    }
    
    if (group) {
      console.log('Found group:', group);
      
      // Get all members of the group
      const { data: members, error: membersError } = await supabase
        .from('user_group_members')
        .select('user_id')
        .eq('group_id', group.id);
      
      if (membersError) {
        console.error('Error finding group members:', membersError);
      } else if (members) {
        // Update or create call records for each member
        for (const member of members) {
          const { error: updateError } = await supabase
            .from('calls')
            .upsert({
              call_sid: callSid,
              user_id: member.user_id,
              status: callStatus,
              from_number: fromNumber,
              to_number: calledNumber,
              updated_at: new Date().toISOString(),
            });
          
          if (updateError) {
            console.error('Error updating call record for member:', member.user_id, updateError);
          }
        }
      }
    }
    
    // Return empty TwiML response
    const twiml = new VoiceResponse();
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