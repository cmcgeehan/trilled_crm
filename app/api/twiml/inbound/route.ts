import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface User {
  id: string;
  twilio_phone: string;
}

export async function POST(request: Request) {
  try {
    console.log('Inbound call received');
    const formData = await request.formData();
    const calledNumber = formData.get('To') as string;
    const fromNumber = formData.get('From') as string;
    
    console.log('Call details:', { calledNumber, fromNumber });
    
    // Find the user associated with this Twilio number
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, twilio_phone')
      .eq('twilio_phone', calledNumber);
    
    if (userError) {
      console.error('Error finding user:', userError);
      return new NextResponse('Error finding user', { status: 500 });
    }
    
    if (!users || users.length === 0) {
      console.log('No user found for number, checking groups:', calledNumber);
      
      // This is a team line call, find the group associated with this number
      const { data: groups, error: groupError } = await supabase
        .from('user_groups')
        .select('id, name, twilio_number')
        .eq('twilio_number', calledNumber);
      
      if (groupError) {
        console.error('Error finding group:', groupError);
        return new NextResponse('Error finding group', { status: 500 });
      }
      
      console.log('Groups found:', groups);
      
      if (!groups || groups.length === 0) {
        console.error('No group found for number:', calledNumber);
        return new NextResponse('No group found for this number', { status: 404 });
      }
      
      const group = groups[0];
      console.log('Found group:', group);
      
      // Find all members of this group who are available
      const { data: groupMembers, error: memberError } = await supabase
        .from('group_memberships')
        .select('user_id')
        .eq('group_id', group.id);
      
      if (memberError) {
        console.error('Error finding group members:', memberError);
        return new NextResponse('Error finding group members', { status: 500 });
      }
      
      if (!groupMembers || groupMembers.length === 0) {
        console.error('No members found for group:', group.id);
        return new NextResponse('No members found for this group', { status: 404 });
      }
      
      // Get user IDs of group members
      const memberUserIds = groupMembers.map((member) => member.user_id);
      console.log('Group member IDs:', memberUserIds);
      
      // Find available users in this group
      const { data: availableUsers, error: availableError } = await supabase
        .from('user_phone_status')
        .select('user_id, status')
        .in('user_id', memberUserIds)
        .neq('status', 'offline');
      
      if (availableError) {
        console.error('Error finding available users:', availableError);
        // Continue with all users if we can't check availability
      }
      
      console.log('Available users:', availableUsers);
      
      // Get user IDs of available users
      const availableUserIds = availableUsers?.map((user: { user_id: string }) => user.user_id) || memberUserIds;
      console.log('Available user IDs:', availableUserIds);
      
      // Find the phone numbers of available users
      const { data: userPhones, error: phoneError } = await supabase
        .from('users')
        .select('id, phone, email')
        .in('id', availableUserIds);
      
      if (phoneError) {
        console.error('Error finding user phones:', phoneError);
        return new NextResponse('Error finding user phones', { status: 500 });
      }
      
      if (!userPhones || userPhones.length === 0) {
        console.error('No phone numbers found for available users');
        return new NextResponse('No available users found', { status: 404 });
      }
      
      console.log('User phones found:', userPhones);
      
      // Create a TwiML response
      const twiml = new VoiceResponse();
      
      // Add recording announcement
      twiml.say('This call may be recorded for quality assurance purposes.');
      
      // Create a dial sequence
      const dial = twiml.dial({
        sequential: true, // Call one number at a time
        timeout: 30, // Wait 30 seconds for each number
      });
      
      // Add each user's phone number to the dial sequence
      userPhones.forEach((user: { phone: string }) => {
        if (user.phone) {
          dial.number(user.phone);
        } else {
          console.error('User has no phone number:', user);
        }
      });
      
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' },
      });
    }
    
    const user = users[0] as User;
    console.log('Found user:', user);
    
    // Check if this is a direct line call
    if (user.twilio_phone === calledNumber) {
      // Check user's availability status
      const { data: statusData, error: statusError } = await supabase
        .from('user_phone_status')
        .select('status')
        .eq('user_id', user.id)
        .single();
      
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
          headers: { 'Content-Type': 'text/xml' },
        });
      }
      
      // If user is away, play a message but still allow the call
      if (userStatus === 'away') {
        const twiml = new VoiceResponse();
        twiml.say('The person you are trying to reach is currently away. Your call will be connected.');
        twiml.dial(fromNumber);
        return new NextResponse(twiml.toString(), {
          headers: { 'Content-Type': 'text/xml' },
        });
      }
      
      // User is available, connect the call
      const twiml = new VoiceResponse();
      
      // Add recording announcement
      twiml.say('This call may be recorded for quality assurance purposes.');
      
      // Dial the caller
      twiml.dial(fromNumber);
      
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml' },
      });
    }
    
    return new NextResponse('Invalid routing configuration', { status: 500 });
  } catch (error) {
    console.error('Error handling inbound call:', error);
    return new NextResponse('Error handling inbound call', { status: 500 });
  }
} 