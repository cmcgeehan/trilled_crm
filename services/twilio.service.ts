import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken || !twimlAppSid || !phoneNumber) {
  throw new Error('Missing Twilio environment variables');
}

const client = twilio(accountSid, authToken);

export async function sendSMS(to: string, body: string) {
  try {
    const message = await client.messages.create({
      body,
      to,
      from: phoneNumber as string
    });
    return message;
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw error;
  }
}

export async function makeCall(to: string, url: string) {
  try {
    const call = await client.calls.create({
      to,
      from: phoneNumber as string,
      url,
      applicationSid: twimlAppSid
    });
    return call;
  } catch (error) {
    console.error('Error making call:', error);
    throw error;
  }
}

export async function updateCallStatus(callSid: string, status: 'completed' | 'canceled') {
  try {
    const call = await client.calls(callSid).update({ status });
    return call;
  } catch (error) {
    console.error('Error updating call status:', error);
    throw error;
  }
} 