'use client';

import { useEffect, useState } from 'react';
import { Device } from '@twilio/voice-sdk';

export default function TwilioClient() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let device: Device | null = null;

    async function setupDevice() {
      try {
        // Get the Twilio token
        const response = await fetch('/api/twilio/token');
        const { token } = await response.json();

        // Initialize the device with default options
        device = new Device(token);

        // Set up event listeners
        device.on('registered', () => {
          console.log('Device registered');
          setIsReady(true);
        });

        device.on('error', (error: Error) => {
          console.error('Device error:', error);
        });

        device.on('incoming', (connection: { accept: () => void }) => {
          console.log('Incoming call');
          // Accept the call automatically
          connection.accept();
        });

        // Register the device
        device.register();

        // Cleanup function
        return () => {
          if (device) {
            device.destroy();
          }
        };
      } catch (error) {
        console.error('Error setting up device:', error);
      }
    }

    setupDevice();
  }, []);

  return (
    <div className="fixed bottom-4 right-4">
      {isReady ? (
        <div className="bg-green-500 text-white px-4 py-2 rounded-full">
          VoIP Ready
        </div>
      ) : (
        <div className="bg-yellow-500 text-white px-4 py-2 rounded-full">
          Connecting...
        </div>
      )}
    </div>
  );
} 