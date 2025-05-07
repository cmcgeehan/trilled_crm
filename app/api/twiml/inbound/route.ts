import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';

export async function POST(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    console.log('Inbound call received');
    const formData = await request.formData();
    const calledNumber = formData.get('To') as string;
    const fromNumber = formData.get('From') as string;
    
    console.log('Call details:', { calledNumber, fromNumber });
    
    // Find the user initiating the call
    const { data: fromUser, error: fromUserError } = await supabase
      .from('users')
      .select('id')
      .eq('phone', fromNumber) // Assuming 'phone' is the column storing user phone numbers
      .maybeSingle();

    if (fromUserError) {
      console.error('Error finding initiating user:', fromUserError);
      // Decide if we should proceed without from_user_id or return an error
      // For now, we'll proceed but log the error.
    }

    const fromUserId = fromUser?.id || null;
    console.log('Initiating User ID (fromUser.id):', fromUserId);
    
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
        record: 'record-from-answer',
        action: `/api/twiml/status?fromNumber=${encodeURIComponent(fromNumber)}`,
        method: 'POST'
      });
      
      // Add the client with explicit parameters
      console.log('Dialing VOIP client for user:', directUser.id);
      dial.client({
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallback: `/api/twilio/status?fromNumber=${encodeURIComponent(fromNumber)}`,
        statusCallbackMethod: 'POST'
      }, directUser.id);
      
      const twimlResponse = twiml.toString();
      console.log('Generated TwiML:', twimlResponse);
      
      // Create call record for direct user
      const { error: callError } = await supabase
        .from('calls')
        .insert({
          call_sid: formData.get('CallSid') as string,
          from_number: fromNumber,
          to_number: calledNumber,
          from_user_id: fromUserId,
          to_user_id: directUser.id,
          status: 'initiated',
          started_at: new Date().toISOString()
        });

      if (callError) {
        console.error('Error creating call record:', callError);
      }

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
      


      console.log(`[TwiML Inbound] Fetched group ${group.id}. Fetching member details...`);

      // Create a base TwiML response
      const twiml = new VoiceResponse();

      // If no users are available, try dialing cell phones sequentially
      if (availableUserIds.length === 0) {
        console.log('No available CRM agents found, attempting sequential dial.');

        // Instead of dialing here, redirect to the sequential dial handler
        // Need the parent CallSid and the original called number (group number)
        const parentCallSid = formData.get('CallSid') as string;
        const groupTwilioNumber = calledNumber; // Already have this from earlier in the function
        
        const redirectUrl = `/api/twiml/sequential-dial?groupId=${group.id}&callSid=${parentCallSid}&fromNumber=${encodeURIComponent(fromNumber)}&dialIndex=0&groupNumber=${encodeURIComponent(groupTwilioNumber)}`;
        
        console.log(`Redirecting to sequential dial: ${redirectUrl}`);
        twiml.redirect({ method: 'POST' }, redirectUrl);

        // --- Create Parent Call Record (BEFORE Redirect/Dial) --- 
        console.log(`[TwiML Inbound] Creating parent call record for group ${group.id} with SID ${formData.get('CallSid')}`);
        const { error: parentCallError } = await supabase
          .from('calls')
          .insert({
            call_sid: formData.get('CallSid') as string,
            from_number: fromNumber,
            to_number: calledNumber,
            from_user_id: fromUserId, // Initiating user ID (if found)
            to_user_id: null, // No specific user answered yet
            status: 'ringing', // Initial status
            direction: 'inbound',
            is_parent_call: true, // Mark as parent call
            group_id: group.id, // *** ADDED group_id ***
            started_at: new Date().toISOString()
          });
        if (parentCallError) {
          console.error('[TwiML Inbound] Error creating parent call record (before seq dial):', parentCallError);
          // Handle error appropriately, maybe don't redirect?
        }
        // End Parent Call Record Creation

        // No need to dial or create another call record here, the redirect handles it.
        return new NextResponse(twiml.toString(), {
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'Cache-Control': 'no-cache'
          },
        });
      }

      // --- Agents are available ---

      // Generate TwiML to dial available agents
      // const twiml = new VoiceResponse(); // Moved up

      // Add recording announcement
      twiml.say({
        voice: 'Polly.Amy',
        language: 'en-US'
      }, 'This call may be recorded for quality assurance purposes.');

      const dial = twiml.dial({
        answerOnBridge: true,
        callerId: fromNumber, // Or group.twilio_phone?
        timeout: 8, // Ring agents for 8 seconds
        record: 'record-from-answer', // Keep recording if needed
        // Action points to the new handler, passing necessary info
        action: `/api/twiml/handle-group-dial-status?groupId=${group.id}&callSid=${formData.get('CallSid')}&fromNumber=${encodeURIComponent(fromNumber)}&calledNumber=${encodeURIComponent(calledNumber)}`,
        method: 'POST'
      });

      // Dial available agents via VOIP client
      availableUserIds.forEach((userId) => {
        console.log('Adding available agent client to dial:', userId);
        // Status callback for *individual* agent legs still goes to the main status handler
        dial.client({
           statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
           statusCallback: `/api/twilio/status?fromNumber=${encodeURIComponent(fromNumber)}`, // Keep original status handler for individual legs
           statusCallbackMethod: 'POST'
        }, userId);
      });

      // --- Create Parent Call Record (BEFORE Dialing Agents) --- 
      console.log(`[TwiML Inbound] Creating parent call record for group ${group.id} with SID ${formData.get('CallSid')}`);
      const { error: parentCallError } = await supabase
        .from('calls')
        .insert({
          call_sid: formData.get('CallSid') as string,
          from_number: fromNumber,
          to_number: calledNumber,
          from_user_id: fromUserId, // Initiating user ID (if found)
          to_user_id: null, // No specific user answered yet
          status: 'ringing', // Initial status
          direction: 'inbound',
          is_parent_call: true, // Mark as parent call
          group_id: group.id, // *** ADDED group_id ***
          started_at: new Date().toISOString()
        });
      if (parentCallError) {
        console.error('[TwiML Inbound] Error creating parent call record (before agent dial):', parentCallError);
        // Handle error appropriately, maybe don't dial?
      }
      // End Parent Call Record Creation

      const twimlResponse = twiml.toString();
      console.log('Generated Group TwiML:', twimlResponse);
      
      return new NextResponse(twimlResponse, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
      });
    }
    
    // If no group is found, play a message and hang up
    console.error('No group found for number:', calledNumber);
    const errorTwiml = new VoiceResponse();
    errorTwiml.say('We could not find the group you are trying to reach. Please try again later.');
    return new NextResponse(errorTwiml.toString(), {
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