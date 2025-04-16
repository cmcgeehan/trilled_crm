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
    action: '/api/twilio/status', // CORRECTED: Use /api/twilio/status
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