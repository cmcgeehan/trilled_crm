import { NextResponse } from 'next/server';
import twilio from 'twilio';

// Initialize Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const apiKey = process.env.TWILIO_API_KEY;
const apiSecret = process.env.TWILIO_API_SECRET;

// Ensure required variables are present
if (!accountSid || !apiKey || !apiSecret) {
  console.error("Missing Twilio API credentials");
  // Optionally throw an error or handle appropriately at startup
}

const client = twilio(apiKey, apiSecret, { accountSid });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const callSid = body.callSid; // Expecting callSid in the request body

    if (!callSid) {
      return NextResponse.json({ error: 'Call SID is required' }, { status: 400 });
    }

    console.log(`[API Hangup] Received request to hang up call SID: ${callSid}`);

    // Optional: Verify user permission to hang up this call via Supabase if needed

    // Update the call resource to terminate it
    const call = await client.calls(callSid).update({ status: 'completed' });

    console.log(`[API Hangup] Successfully requested hangup for call SID: ${call.sid}, New Status: ${call.status}`);

    // You might also want to update your internal 'calls' table status here
    // although the Twilio status callback should eventually handle this too.
    // Example:
    /*
    const { error: dbError } = await supabase
      .from('calls')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('call_sid', callSid); // Make sure you're updating the correct record

    if (dbError) {
      console.error(`[API Hangup] Error updating local DB for call SID ${callSid}:`, dbError);
      // Decide if this should be a failure response
    }
    */

    return NextResponse.json({ success: true, message: `Call ${callSid} hangup initiated.`, status: call.status });

  } catch (err) {
    const error = err as Error; // Keep type assertion for message
    console.error('[API Hangup] Error:', error);

    let statusCode = 500;
    // Check if it looks like a Twilio error (duck typing)
    if (typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number') {
      statusCode = err.status; 
    }

    const errorMessage = error.message || 'Failed to hang up call';
    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
} 