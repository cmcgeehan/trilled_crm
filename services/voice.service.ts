import { Device } from '@twilio/voice-sdk';
import { supabase } from '@/lib/supabase';

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

  async updateAvailability(status: 'available' | 'busy' | 'unavailable'): Promise<void> {
    try {
      // Get the current user first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('No authenticated user');
      }

      // Update availability status in the database using upsert
      const { error } = await supabase
        .from('user_phone_status')
        .upsert({
          user_id: user.id,
          status,
          last_updated: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('Error updating availability status:', error);
        throw error;
      }

      // Only handle device registration for available/unavailable states
      if (status === 'available') {
        if (!this.device) {
          console.warn('Device not initialized, attempting to initialize...');
          await this.initialize();
        }
        
        if (this.device && !this.isRegistered) {
          await this.device.register();
          this.isRegistered = true;
        }
      } else if (status === 'unavailable') {
        if (this.device && this.isRegistered) {
          await this.device.unregister();
          this.isRegistered = false;
        }
      }
      // For 'busy' status, we don't change the device registration state
    } catch (error) {
      console.error('Error updating availability:', error);
      throw error;
    }
  }

  // New method to handle call state without affecting registration
  async setCallState(isInCall: boolean): Promise<void> {
    try {
      // Get the current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('No authenticated user');
      }

      // Update call state in the database
      const { error } = await supabase
        .from('user_phone_status')
        .upsert({
          user_id: user.id,
          status: isInCall ? 'busy' : 'available',
          last_updated: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('Error updating call state:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error setting call state:', error);
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