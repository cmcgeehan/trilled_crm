import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const dialCallStatus = formData.get('DialCallStatus') as string;
    const callSid = formData.get('CallSid') as string; // This is the parent CallSid

    // Get parameters passed from the inbound route
    const searchParams = request.nextUrl.searchParams;
    const groupId = searchParams.get('groupId');
    const fromNumber = searchParams.get('fromNumber');
    const calledNumber = searchParams.get('calledNumber'); // The group's number

    console.log('Handling group dial status:', { dialCallStatus, callSid, groupId, fromNumber, calledNumber });

    const twiml = new VoiceResponse();

    // If the call was answered by an agent, DialCallStatus will be 'completed'.
    // Twilio connects the call automatically. The individual leg's status callback 
    // (/api/twilio/status) handles creating the child record.
    // We just need to end this TwiML execution gracefully.
    if (dialCallStatus === 'completed') {
      console.log(`Group call ${callSid} answered by an agent.`);
      // Potentially update the parent call record status if needed, though /api/twilio/status might handle this too
      await supabase
        .from('calls')
        .update({ status: 'in-progress' }) // Or 'answered', check consistency
        .eq('call_sid', callSid);
      twiml.hangup(); // Or just return empty response
      return new NextResponse(twiml.toString(), {
        headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    }

    // If status is 'no-answer', 'busy', or 'failed', initiate fallback via redirect.
    if (['no-answer', 'busy', 'failed'].includes(dialCallStatus)) {
      console.log(`Group call ${callSid} not answered by agents (Status: ${dialCallStatus}). Redirecting to sequential cell dial.`);

      // Need calledNumber from original request, should be passed through
      const groupTwilioNumber = searchParams.get('calledNumber'); // Get from params passed to this route

      if (!groupId || !callSid || !fromNumber || !groupTwilioNumber) {
        console.error('Missing parameters for sequential dial redirect', { groupId, callSid, fromNumber, groupTwilioNumber });
        twiml.say('An error occurred while transferring your call. Please try again later.');
        return new NextResponse(twiml.toString(), { /* headers */ });
      }

      // Update parent call status to indicate fallback redirection
      await supabase
        .from('calls')
        .update({ status: 'redirecting-to-sequential' }) // Consistent status
        .eq('call_sid', callSid);

      // Redirect to the sequential dial handler, passing groupNumber
      const redirectUrl = `/api/twiml/sequential-dial?groupId=${groupId}&callSid=${callSid}&fromNumber=${encodeURIComponent(fromNumber)}&dialIndex=0&groupNumber=${encodeURIComponent(groupTwilioNumber)}`;
      console.log(`Redirecting to sequential dial: ${redirectUrl}`);
      twiml.redirect({ method: 'POST' }, redirectUrl);
      
      // No need to fetch numbers or dial here anymore

    } else {
      // Handle other unexpected statuses if necessary
      console.warn(`Unexpected DialCallStatus: ${dialCallStatus} for call ${callSid}`);
      twiml.say('An unexpected error occurred. Please try again.');
      twiml.hangup();
    }

    return new NextResponse(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-cache' },
    });

  } catch (error) {
    console.error('Error in handle-group-dial-status:', error);
    const twiml = new VoiceResponse();
    twiml.say('An internal server error occurred.');
    return new NextResponse(twiml.toString(), {
      status: 500,
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  }
} 