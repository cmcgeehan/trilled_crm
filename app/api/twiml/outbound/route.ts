import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// Initialize Supabase outside handler for reuse if needed, or inside if per-request client is preferred
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const twiml = new twilio.twiml.VoiceResponse();
  
  // Get the 'to' number from the URL parameters
  const url = new URL(request.url);
  const to = url.searchParams.get('to');

  if (!to) {
    twiml.say({ voice: 'Polly.Amy' }, 'No number was provided to dial.');
    return new NextResponse(twiml.toString(), {
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  }

  // Add the recording announcement
  twiml.say({ 
    voice: 'Polly.Amy',
    language: 'en-GB'
  }, 'This call will be recorded for training purposes.');

  // Add a dial verb to connect the call
  const dial = twiml.dial({
    callerId: process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER,
    record: 'record-from-answer', // This will start recording when the call is answered
    action: '/api/twiml/status', // Add status callback
    method: 'POST'
  });
  dial.number(to);

  // Return the TwiML as XML
  return new NextResponse(twiml.toString(), {
    headers: {
      'Content-Type': 'text/xml',
    },
  });
}

// --- POST Handler: Creates Initial Call Record --- 
export async function POST(request: Request) {
  const twiml = new twilio.twiml.VoiceResponse();
  let callSid: string | null = null; // Keep track of callSid for logging
  
  try {
    const body = await request.formData();
    const to = body.get('To') as string | null;
    const from = body.get('From') as string | null; // Should be client:AGENT_UUID
    callSid = body.get('CallSid') as string | null;

    console.log(`[TwiML Outbound POST] SID: ${callSid}, To: ${to}, From: ${from}`);

    if (!to || !from || !callSid) {
      console.error("[TwiML Outbound POST] Error: Missing To, From, or CallSid in request body.");
      twiml.say('Call initiation error: Missing required parameters.');
      return new NextResponse(twiml.toString(), { status: 400, headers: { 'Content-Type': 'text/xml' } });
    }

    // Extract Agent User ID from 'From' (assuming format client:UUID)
    let agentUserId: string | null = null;
    if (from.startsWith('client:')) {
      agentUserId = from.substring(7);
    } else {
      console.error(`[TwiML Outbound POST] Error: 'From' parameter (${from}) is not a client identifier.`);
      twiml.say('Call initiation error: Invalid caller identity.');
      return new NextResponse(twiml.toString(), { status: 400, headers: { 'Content-Type': 'text/xml' } });
    }

    // --- Create Initial Call Record --- 
    console.log(`[TwiML Outbound POST] Creating initial call record for SID: ${callSid}`);
    const initialCallData: Database['public']['Tables']['calls']['Insert'] = {
        call_sid: callSid,
        direction: 'outbound', // Add direction back now that schema/types are updated
        status: 'initiated', // Initial status
        from_user_id: agentUserId,
        to_number: to, // The number/client being dialed
        from_number: process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER || '', // Agent's Twilio number (provide fallback)
        started_at: new Date().toISOString(),
        // to_user_id will be populated by handleCallEnd on frontend or status callback later
    };

    const { data: newCall, error: createError } = await supabase
      .from('calls')
      .insert(initialCallData)
      .select('id') // Select only id
      .single();

    if (createError) {
        console.error(`[TwiML Outbound POST] Error creating initial call record for SID ${callSid}:`, createError);
        // Decide if call should still proceed? Maybe just hangup.
        twiml.say('Failed to initialize call record. Please try again.');
        // twiml.hangup(); // Option to hangup immediately
        return new NextResponse(twiml.toString(), { status: 500, headers: { 'Content-Type': 'text/xml' } });
    }
     console.log(`[TwiML Outbound POST] Initial call record created with ID: ${newCall?.id} for SID: ${callSid}`);

    // --- Generate TwiML --- 
    const callerId = process.env.TWILIO_PHONE_NUMBER || process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER;
    if (!callerId) {
      // Handle missing caller ID (error already logged, maybe just hangup?)
      twiml.hangup();
      return new NextResponse(twiml.toString(), { status: 500, headers: { 'Content-Type': 'text/xml' } });
    }

    const dial = twiml.dial({
      callerId: callerId,
      record: 'record-from-answer',
      action: '/api/twiml/status', 
      method: 'POST'
    });
    
    // Check if 'to' is a client identifier or a phone number
    if (to.startsWith('client:')) {
      dial.client(to.substring(7)); 
    } else {
      dial.number(to); 
    }

    console.log(`[TwiML Outbound POST] SID ${callSid} - Generating Dial TwiML: ${twiml.toString()}`);
    return new NextResponse(twiml.toString(), { headers: { 'Content-Type': 'text/xml' } });

  } catch (error) {
      console.error(`[TwiML Outbound POST] Unexpected error for SID ${callSid || 'unknown'}:`, error);
      twiml.say('An unexpected error occurred.');
      // Optionally add hangup if severe error
      // twiml.hangup(); 
      return new NextResponse(twiml.toString(), { status: 500, headers: { 'Content-Type': 'text/xml' } });
  }
} 