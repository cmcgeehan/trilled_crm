import { Device } from '@twilio/voice-sdk';
import { supabase } from '@/lib/supabase';
import { AgentStatus } from '@/lib/utils';

export class VoiceService {
  private device: Device | null = null;
  private token: string | null = null;
  private isRegistered: boolean = false;
  private isDestroying: boolean = false;

  async initialize(): Promise<Device> {
    try {
      // Get the current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // Get a new token
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Token response error:', errorText);
        throw new Error('Failed to get token');
      }

      const { token } = await response.json();
      this.token = token;

      // Initialize the device
      this.device = new Device(token, {
        // Set the codec preferences
        codecPreferences: ['opus', 'pcmu'] as any,
        // Set the edge
        edge: 'ashburn',
        // Set the log level
        logLevel: 1
      });

      // Set up device event handlers
      this.device.on('registered', () => {
        console.log('Device registered');
        this.isRegistered = true;
      });

      this.device.on('unregistered', () => {
        console.log('Device unregistered');
        this.isRegistered = false;
      });

      this.device.on('error', (error) => {
        console.error('Device error:', error);
        this.isRegistered = false;
      });

      // Register the device
      await this.device.register();
      this.isRegistered = true;

      return this.device;
    } catch (error) {
      console.error('Error initializing voice service:', error);
      throw error;
    }
  }

  async updateAvailability(status: AgentStatus): Promise<void> {
    try {
      // Get the current user first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('No authenticated user');
      }

      console.log(`[VoiceService] Updating availability for user ${user.id} to status: ${status}`);

      // Update availability status in the database using upsert
      const { error } = await supabase
        .from('user_phone_status')
        .upsert({
          user_id: user.id,
          status: status,
          last_updated: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('Error updating availability status in DB:', error);
        throw error;
      }
      console.log(`[VoiceService] DB status updated successfully to: ${status}`);

      // Handle device registration based on status
      if (status === AgentStatus.AVAILABLE) {
        if (!this.device) {
          console.warn('[VoiceService] Device not initialized, attempting to initialize...');
          console.error('[VoiceService] Cannot register: Device not initialized.');
        } else if (!this.isRegistered) {
          console.log('[VoiceService] Status is AVAILABLE, registering device...');
          await this.device.register();
          this.isRegistered = true;
          console.log('[VoiceService] Device registered.');
        } else {
           console.log('[VoiceService] Status is AVAILABLE, device already registered.');
        }
      } else if (status === AgentStatus.UNAVAILABLE) {
        if (this.device && this.isRegistered) {
          console.log('[VoiceService] Status is UNAVAILABLE, unregistering device...');
          await this.device.unregister();
          this.isRegistered = false;
           console.log('[VoiceService] Device unregistered.');
        } else {
           console.log('[VoiceService] Status is UNAVAILABLE, device already unregistered or not initialized.');
        }
      } else {
         // For BUSY or WRAP_UP status, we don't change the device registration state
         console.log(`[VoiceService] Status is ${status}. No change to device registration needed.`);
      }

    } catch (error) {
      console.error(`[VoiceService] Error updating availability to ${status}:`, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.isDestroying) return;
    this.isDestroying = true;

    try {
      if (this.device) {
        // Only unregister if the device is currently registered
        if (this.isRegistered) {
          await this.device.unregister();
          this.isRegistered = false;
        }
        this.device.destroy();
        this.device = null;
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
    } finally {
      this.isDestroying = false;
    }
  }

  async makeCall(to: string): Promise<any> {
    if (!this.device) {
      throw new Error('Device not initialized');
    }

    try {
      const connection = await this.device.connect({
        params: {
          To: to
        }
      });

      return connection;
    } catch (error) {
      console.error('Error making call:', error);
      throw error;
    }
  }
} 