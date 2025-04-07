import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Only initialize the client if all required variables are present
const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

export async function sendSMS(to: string, body: string) {
  if (!client || !phoneNumber) {
    console.warn('Twilio client not initialized - SMS functionality disabled');
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    const message = await client.messages.create({
      body,
      to,
      from: phoneNumber
    });
    return message;
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw error;
  }
}

export async function makeCall(to: string, url: string) {
  if (!client || !phoneNumber || !twimlAppSid) {
    console.warn('Twilio client not initialized - Call functionality disabled');
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    const call = await client.calls.create({
      to,
      from: phoneNumber,
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
  if (!client) {
    console.warn('Twilio client not initialized - Call status update disabled');
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    const call = await client.calls(callSid).update({ status });
    return call;
  } catch (error) {
    console.error('Error updating call status:', error);
    throw error;
  }
} 