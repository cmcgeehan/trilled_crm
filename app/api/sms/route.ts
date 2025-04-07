import { NextResponse } from 'next/server';
import { sendSMS } from '@/services/twilio.service';

export async function POST(request: Request) {
  try {
    const { from, to, body } = await request.json();

    if (!from || !to || !body) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const result = await sendSMS(to, body);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error sending SMS:', error);
    return NextResponse.json(
      { error: 'Failed to send SMS' },
      { status: 500 }
    );
  }
} 