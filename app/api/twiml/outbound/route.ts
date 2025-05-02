import { NextResponse } from 'next/server';
import twilio from 'twilio';

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

// --- Add POST Handler --- 
export async function POST(request: Request) {
  const twiml = new twilio.twiml.VoiceResponse();
  
  // Parse the request body (form-urlencoded)
  const body = await request.formData();
  const to = body.get('To') as string | null;
  const from = body.get('From') as string | null; // Twilio client identifier (e.g., client:...) or number

  console.log(`[TwiML Outbound] Received POST request. To: ${to}, From: ${from}`);

  if (!to) {
    console.error("[TwiML Outbound] Error: No 'To' number found in POST request body.");
    twiml.say({ voice: 'Polly.Amy' }, 'Could not determine the number to dial.');
    return new NextResponse(twiml.toString(), {
      status: 400, // Bad Request
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  }

  // You might want to implement logic here to determine the caller ID
  // based on the 'from' identifier if needed, or use a default.
  const callerId = process.env.TWILIO_PHONE_NUMBER || process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER;
  if (!callerId) {
    console.error('[TwiML Outbound] Error: TWILIO_PHONE_NUMBER environment variable not set.');
    twiml.say({ voice: 'Polly.Amy' }, 'Call configuration error.');
    return new NextResponse(twiml.toString(), {
      status: 500, // Internal Server Error
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  }
  
  // Note: Recording announcement might not be desired for *every* outbound call.
  // Consider adding logic to conditionally include this.
  // twiml.say({ voice: 'Polly.Amy', language: 'en-GB' }, 'This call will be recorded for training purposes.');

  const dial = twiml.dial({
    callerId: callerId,
    // Consider making recording conditional based on call type or settings
    record: 'record-from-answer',
    action: '/api/twilio/status', // Status callback URL remains the same
    method: 'POST'
  });
  
  // Check if 'to' is a client identifier or a phone number
  if (to.startsWith('client:')) {
    dial.client(to.substring(7)); // Dial client identity
  } else {
    dial.number(to); // Dial phone number
  }

  console.log(`[TwiML Outbound] Generating TwiML: ${twiml.toString()}`);

  // Return the TwiML as XML
  return new NextResponse(twiml.toString(), {
    headers: {
      'Content-Type': 'text/xml',
    },
  });
} 