import twilio from 'twilio';

export class TwilioService {
  private client: twilio.Twilio;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials are not properly configured');
    }

    this.client = twilio(accountSid, authToken);
  }

  async makeCall(from: string, to: string, url: string) {
    try {
      const call = await this.client.calls.create({
        from,
        to,
        url,
      });
      return call.sid;
    } catch (error) {
      console.error('Error making call:', error);
      throw error;
    }
  }

  async sendSMS(from: string, to: string, body: string) {
    try {
      const message = await this.client.messages.create({
        from,
        to,
        body,
      });
      return message.sid;
    } catch (error) {
      console.error('Error sending SMS:', error);
      throw error;
    }
  }
} 