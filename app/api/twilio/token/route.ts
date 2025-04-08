import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import twilio from 'twilio';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Extract the token from the header
    const token = authHeader.replace('Bearer ', '');
    
    // Get the user from the token
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Error getting user:', userError);
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // Get the user's details from the database
    const { data: userData, error: dbError } = await supabase
      .from('users')
      .select('id, twilio_phone')
      .eq('id', user.id)
      .single();

    if (dbError || !userData) {
      console.error('Error getting user data:', dbError);
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // Create an access token
    const accessToken = new twilio.jwt.AccessToken(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_API_KEY!,
      process.env.TWILIO_API_SECRET!,
      { identity: userData.id }
    );

    // Add voice grant to the token
    const voiceGrant = new twilio.jwt.AccessToken.VoiceGrant({
      outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID,
      incomingAllow: true
    });

    accessToken.addGrant(voiceGrant);

    // Generate the token
    const tokenString = accessToken.toJwt();
    console.log('Generated token for user:', userData.id);

    return NextResponse.json({ token: tokenString });
  } catch (error) {
    console.error('Error generating token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}