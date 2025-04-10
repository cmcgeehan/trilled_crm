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
    
    console.log('Status details:', { callSid, callStatus, calledNumber, fromNumber });
    
    // First check if this is a direct call to a user
    const { data: directUser, error: userError } = await supabase
      .from('users')
      .select('id, twilio_phone')
      .eq('twilio_phone', calledNumber)
      .maybeSingle();
    
    if (userError) {
      console.error('Error finding user:', userError);
      // Return empty TwiML response with correct Content-Type
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
          from_number: fromNumber,
          to_number: calledNumber,
          started_at: new Date().toISOString(),
        });
      
      if (updateError) {
        console.error('Error updating call record:', updateError);
      }
      
      // Return empty TwiML response with correct Content-Type
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
      .select('id, name, twilio_phone')
      .eq('twilio_phone', calledNumber)
      .maybeSingle();
    
    if (groupError) {
      console.error('Error finding group:', groupError);
      // Return empty TwiML response with correct Content-Type
      const twiml = new VoiceResponse();
      return new NextResponse(twiml.toString(), {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
      });
    }
    
    if (!group) {
      console.error('No group found for number:', calledNumber);
      // Return empty TwiML response with correct Content-Type
      const twiml = new VoiceResponse();
      return new NextResponse(twiml.toString(), {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
      });
    }
    
    console.log('Found group:', group);
    
    // Find all members of this group
    const { data: groupMembers, error: memberError } = await supabase
      .from('group_memberships')
      .select('user_id')
      .eq('group_id', group.id);
    
    if (memberError) {
      console.error('Error finding group members:', memberError);
      // Return empty TwiML response with correct Content-Type
      const twiml = new VoiceResponse();
      return new NextResponse(twiml.toString(), {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
      });
    }
    
    if (!groupMembers || groupMembers.length === 0) {
      console.error('No members found for group:', group.id);
      // Return empty TwiML response with correct Content-Type
      const twiml = new VoiceResponse();
      return new NextResponse(twiml.toString(), {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
      });
    }
    
    // Get user IDs of group members
    const memberUserIds = groupMembers.map((member) => member.user_id);
    console.log('Group member IDs:', memberUserIds);
    
    // Update or create call records for each group member
    for (const userId of memberUserIds) {
      const { error: updateError } = await supabase
        .from('calls')
        .upsert({
          call_sid: callSid,
          user_id: userId,
          status: callStatus,
          from_number: fromNumber,
          to_number: calledNumber,
          started_at: new Date().toISOString(),
        });
      
      if (updateError) {
        console.error('Error updating call record for user:', userId, updateError);
      }
    }
    
    // Return empty TwiML response with correct Content-Type
    const twiml = new VoiceResponse();
    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-cache'
      },
    });
  } catch (error) {
    console.error('Error handling status callback:', error);
    // Return empty TwiML response with correct Content-Type
    const twiml = new VoiceResponse();
    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-cache'
      },
    });
  }
} 