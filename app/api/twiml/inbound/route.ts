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
    console.log('Inbound call received');
    const formData = await request.formData();
    const calledNumber = formData.get('To') as string;
    const fromNumber = formData.get('From') as string;
    
    console.log('Call details:', { calledNumber, fromNumber });
    
    // First check if this is a direct call to a user
    const { data: directUser, error: userError } = await supabase
      .from('users')
      .select('id, twilio_phone')
      .eq('twilio_phone', calledNumber)
      .maybeSingle();
    
    if (userError) {
      console.error('Error finding user:', userError);
      const twiml = new VoiceResponse();
      twiml.say('We are experiencing technical difficulties. Please try again later.');
      return new NextResponse(twiml.toString(), {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
      });
    }
    
    if (directUser) {
      console.log('Found direct user:', directUser);
      
      // Check user's availability status
      const { data: statusData, error: statusError } = await supabase
        .from('user_phone_status')
        .select('status')
        .eq('user_id', directUser.id)
        .maybeSingle();
      
      if (statusError) {
        console.error('Error checking user status:', statusError);
        // Default to available if we can't check status
      }
      
      const userStatus = statusData?.status || 'available';
      console.log('User status:', userStatus);
      
      // If user is offline, play a message and hang up
      if (userStatus === 'offline') {
        const twiml = new VoiceResponse();
        twiml.say('The person you are trying to reach is currently unavailable. Please try again later.');
        return new NextResponse(twiml.toString(), {
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'Cache-Control': 'no-cache'
          },
        });
      }
      
      // If user is away, play a message but still allow the call
      if (userStatus === 'away') {
        const twiml = new VoiceResponse();
        twiml.say('The person you are trying to reach is currently away. Your call will be connected.');
        const dial = twiml.dial({
          answerOnBridge: true,
          callerId: calledNumber,
          timeout: 30,
          action: '/api/twiml/status'
        });
        dial.client(directUser.id);
        return new NextResponse(twiml.toString(), {
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'Cache-Control': 'no-cache'
          },
        });
      }
      
      // User is available, connect the call
      const twiml = new VoiceResponse();
      
      // Add recording announcement with explicit voice and language
      twiml.say({
        voice: 'Polly.Amy',
        language: 'en-US'
      }, 'This call may be recorded for quality assurance purposes.');
      
      // Dial the caller using VOIP client
      const dial = twiml.dial({
        answerOnBridge: true,
        callerId: fromNumber,
        timeout: 30,
        action: `/api/twiml/status?fromNumber=${encodeURIComponent(fromNumber)}`,
        method: 'POST'
      });
      
      // Add the client with explicit parameters
      console.log('Dialing VOIP client for user:', directUser.id);
      dial.client({
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallback: `/api/twiml/status?fromNumber=${encodeURIComponent(fromNumber)}`,
        statusCallbackMethod: 'POST'
      }, directUser.id);
      
      const twimlResponse = twiml.toString();
      console.log('Generated TwiML:', twimlResponse);
      
      return new NextResponse(twimlResponse, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
      });
    }
    
    // If not a direct call, check if it's a group call
    console.log('No direct user found, checking groups:', calledNumber);
    
    // Find the group associated with this number
    const { data: group } = await supabase
      .from('user_groups')
      .select('id, name, twilio_phone')
      .eq('twilio_phone', calledNumber)
      .maybeSingle();
    
    if (group) {
      console.log('Found group:', group);
      
      // Find all members of this group
      const { data: groupMembers, error: memberError } = await supabase
        .from('group_memberships')
        .select('user_id')
        .eq('group_id', group.id);
      
      if (memberError) {
        console.error('Error finding group members:', memberError);
        const twiml = new VoiceResponse();
        twiml.say('We are experiencing technical difficulties. Please try again later.');
        return new NextResponse(twiml.toString(), {
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'Cache-Control': 'no-cache'
          },
        });
      }
      
      if (!groupMembers || groupMembers.length === 0) {
        console.error('No members found for group:', group.id);
        const twiml = new VoiceResponse();
        twiml.say('There are no members available in this group. Please try again later.');
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
      
      // Find available users in this group
      const { data: availableUsers, error: availableError } = await supabase
        .from('user_phone_status')
        .select('user_id, status')
        .in('user_id', memberUserIds)
        .in('status', ['available', 'away']);
      
      if (availableError) {
        console.error('Error finding available users:', availableError);
        // Continue with all users if we can't check availability
      }
      
      console.log('Available users:', availableUsers);
      
      // Get user IDs of available users
      const availableUserIds = availableUsers?.map((user: { user_id: string }) => user.user_id) || [];
      console.log('Available user IDs:', availableUserIds);
      
      // If no users are available, play a message and hang up
      if (availableUserIds.length === 0) {
        console.log('No available users found');
        const twiml = new VoiceResponse();
        twiml.say('No one is available to take your call right now. Please try again later.');
        return new NextResponse(twiml.toString(), {
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'Cache-Control': 'no-cache'
          },
        });
      }
      
      // Create a TwiML response
      const twiml = new VoiceResponse();
      
      // Add recording announcement
      twiml.say({
        voice: 'Polly.Amy',
        language: 'en-US'
      }, 'This call may be recorded for quality assurance purposes.');
      
      // Create a dial sequence for VOIP clients
      const dial = twiml.dial({
        answerOnBridge: true,
        callerId: fromNumber,
        timeout: 30,
        action: `/api/twiml/status?fromNumber=${encodeURIComponent(fromNumber)}`,
        method: 'POST'
      });
      
      // Add each available user's client with proper configuration
      availableUserIds.forEach((userId: string) => {
        console.log('Dialing user:', userId);
        dial.client({
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          statusCallback: `/api/twiml/status?fromNumber=${encodeURIComponent(fromNumber)}`,
          statusCallbackMethod: 'POST'
        }, userId);
      });
      
      console.log('Generated TwiML:', twiml.toString());
      
      return new NextResponse(twiml.toString(), {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
      });
    }
    
    // If no group is found, play a message and hang up
    console.error('No group found for number:', calledNumber);
    const twiml = new VoiceResponse();
    twiml.say('We could not find the group you are trying to reach. Please try again later.');
    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-cache'
      },
    });
  } catch (error) {
    console.error('Error handling inbound call:', error);
    // Return a valid TwiML response even in case of error
    const twiml = new VoiceResponse();
    twiml.say('We are experiencing technical difficulties. Please try again later.');
    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'Cache-Control': 'no-cache'
      },
    });
  }
} 