import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';
import type { Database } from '@/types/supabase';

// Remove unused type definitions
// type User = Database['public']['Tables']['users']['Row'];

// Initialize Supabase client (typed)
const supabase: SupabaseClient<Database> = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper to shuffle an array (optional, for randomizing dial order)
// function shuffleArray<T>(array: T[]): T[] {
//   for (let i = array.length - 1; i > 0; i--) {
//     const j = Math.floor(Math.random() * (i + 1));
//     [array[i], array[j]] = [array[j], array[i]];
//   }
//   return array;
// }

export async function POST(request: NextRequest) {
  const twiml = new VoiceResponse();
  try {
    const body = await request.formData();
    const searchParams = request.nextUrl.searchParams;

    // Get parameters from URL or request body
    const groupId = searchParams.get('groupId') || body.get('groupId') as string;
    const callSid = searchParams.get('callSid') || body.get('CallSid') as string;
    const fromNumber = searchParams.get('fromNumber') || body.get('From') as string;
    const dialIndexParam = searchParams.get('dialIndex') || body.get('dialIndex') as string;
    const dialIndex = parseInt(dialIndexParam || '0', 10);
    const groupNumber = searchParams.get('groupNumber') || body.get('groupNumber') as string; // Get the group number
    
    // Get Dial status if this is an action callback
    const dialCallStatus = body.get('DialCallStatus') as string | null;

    console.log('Sequential Dial Handler:', { groupId, callSid, fromNumber, groupNumber, dialIndex, dialCallStatus });

    // If the previous attempt was answered, just hang up this TwiML execution.
    if (dialCallStatus === 'completed') {
      console.log(`Sequential dial for ${callSid}: Call answered. Hanging up TwiML flow.`);
      twiml.hangup();
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    }

    // --- Proceed if not answered or it's the first attempt --- 
    if (!groupId) {
      throw new Error('Missing groupId for sequential dial');
    }

    // 1. Fetch user IDs from group members
    const { data: groupMembers, error: memberError } = await supabase
      .from('group_memberships')
      .select('user_id') // Select only the user_id
      .eq('group_id', groupId);

    if (memberError) {
      console.error('Error fetching group member IDs:', memberError);
      throw memberError;
    }

    if (!groupMembers || groupMembers.length === 0) {
      console.log(`Sequential dial: No members found for group ${groupId}`);
      twiml.say('There are no members configured for this group.');
      twiml.hangup();
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    }

    const userIds = groupMembers.map(m => m.user_id).filter(id => !!id);

    if (userIds.length === 0) {
       console.log(`Sequential dial: No valid user IDs found for group ${groupId}`);
       twiml.say('No valid users found in this group.');
       twiml.hangup();
       return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    }
    
    // 2. Fetch phone numbers for those user IDs
    const { data: usersWithPhones, error: usersError } = await supabase
      .from('users')
      .select('id, phone')
      .in('id', userIds);
    
    if (usersError) {
      console.error('Error fetching user phone numbers:', usersError);
      throw usersError;
    }

    // Now map and filter safely
    const phoneNumbers = usersWithPhones
      ?.map(u => u.phone) 
      .filter((phone): phone is string => !!phone && phone.trim() !== '');
    
    // Optional: Shuffle the numbers for fairness/randomness
    // const shuffledNumbers = shuffleArray(phoneNumbers || []);
    const numbersToDial = phoneNumbers || [];

    console.log('Sequential Dial Handler: Numbers to potentially dial:', numbersToDial);

    // 3. Check if the current dialIndex is valid
    if (dialIndex >= numbersToDial.length) {
      console.log(`Sequential dial for ${callSid}: Reached end of list (index ${dialIndex}). No answer.`);
      twiml.say('Sorry, we attempted to reach all available numbers, but no one answered. Please try again later.');
      twiml.hangup();
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    }

    // 4. Get the number to dial for this attempt
    const numberToDial = numbersToDial[dialIndex];
    console.log(`Sequential dial for ${callSid}: Attempting index ${dialIndex}, number ${numberToDial}`);

    // 5. Generate TwiML to dial this single number
    if (dialIndex === 0 && !dialCallStatus) { // Only say this on the very first attempt
        twiml.say('Please wait while we try to connect you.');
    }
    
    const nextIndex = dialIndex + 1;
    // Ensure groupNumber is passed along in the action URL (still useful for context/logging if needed)
    const actionUrl = `/api/twiml/sequential-dial?groupId=${groupId}&callSid=${callSid}&fromNumber=${encodeURIComponent(fromNumber)}&dialIndex=${nextIndex}&groupNumber=${encodeURIComponent(groupNumber)}`;

    const dial = twiml.dial({
      callerId: fromNumber || undefined, // Always use original caller's number
      timeout: 15, // Timeout for this specific attempt (adjust as needed)
      action: actionUrl,
      method: 'POST',
    });
    dial.number(numberToDial);
    
    // Important: If the Dial action above gets a no-answer, Twilio calls the action URL.
    // If the Dial completes *without* hitting the action (e.g., timeout wasn't hit? unlikely, but safety), 
    // Twilio moves to the *next* verb. We add a Hangup here as a fallback, 
    // although ideally the action handler logic above should cover all outcomes.
    twiml.hangup(); 

    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-cache' },
    });

  } catch (error) {
    console.error('Error in sequential-dial handler:', error);
    twiml.say('An error occurred while attempting to connect your call.');
    twiml.hangup();
    return new NextResponse(twiml.toString(), {
      status: 500,
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  }
} 