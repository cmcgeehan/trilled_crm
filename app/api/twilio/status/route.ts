import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const callSid = formData.get('CallSid') as string;
    const callStatus = formData.get('CallStatus') as string;
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const duration = formData.get('CallDuration') as string;

    // Get recordings if they exist
    let recordingUrl = null;
    if (callStatus === 'completed') {
      const recordings = await twilioClient.recordings.list({ callSid });
      if (recordings.length > 0) {
        recordingUrl = recordings[0].uri;
      }
    }

    // Find the user associated with this number
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('twilio_number', to)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update or create call record
    const { data: existingCall } = await supabase
      .from('calls')
      .select('id')
      .eq('twilio_sid', callSid)
      .single();

    if (existingCall) {
      // Update existing call
      await supabase
        .from('calls')
        .update({
          status: callStatus,
          duration: parseInt(duration || '0'),
          recording_url: recordingUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingCall.id);
    } else {
      // Create new call record
      await supabase
        .from('calls')
        .insert({
          user_id: user.id,
          from_number: from,
          to_number: to,
          status: callStatus,
          duration: parseInt(duration || '0'),
          twilio_sid: callSid,
          recording_url: recordingUrl
        });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error handling call status:', error);
    return NextResponse.json(
      { error: 'Failed to handle call status' },
      { status: 500 }
    );
  }
} 