import { createClient } from '@supabase/supabase-js';
import { Device } from '@twilio/voice-sdk';

export class VoiceService {
  private device: Device | null = null;
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  private async getToken(): Promise<string> {
    try {
      const { data: { session }, error: sessionError } = await this.supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error('No session found:', sessionError);
        throw new Error('No session found');
      }

      const response = await fetch('/api/twilio/token', {
        method: 'POST',
        credentials: 'include', // Include cookies in the request
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get token: ${response.statusText}`);
      }

      const data = await response.json();
      return data.token;
    } catch (error) {
      console.error('Error getting token:', error);
      throw error;
    }
  }

  // ... existing code ...
} 