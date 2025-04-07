import { NextResponse } from 'next/server';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';

export async function POST(request: Request) {
  const formData = await request.formData();
  const digits = formData.get('Digits');
  const response = new VoiceResponse();

  if (digits === '1') {
    // Handle voicemail
    response.say('Please leave your message after the tone.');
    response.record({
      action: '/api/twiml/handle-recording',
      method: 'POST',
      maxLength: 60,
    });
  } else if (digits === '2') {
    // Transfer to operator
    response.say('Please hold while we connect you to an operator.');
    const dial = response.dial();
    // Add your operator's number here
    dial.number(process.env.OPERATOR_PHONE_NUMBER || '');
  } else {
    response.say('Invalid option. Goodbye!');
    response.hangup();
  }

  return new NextResponse(response.toString(), {
    headers: {
      'Content-Type': 'text/xml',
    },
  });
} 