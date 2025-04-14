"use client";

import { useState, useEffect, useRef } from "react"
import { Phone, PhoneOff, PhoneIncoming, PhoneOutgoing, Circle, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { VoiceService } from "@/services/voice.service"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useRouter } from 'next/navigation'

type PhoneStatus = 'available' | 'busy' | 'unavailable'

interface BaseCall {
  sid: string;
  status: string;
}

interface IncomingCall extends BaseCall {
  accept: () => Promise<void>;
  reject: () => void;
}

interface ActiveCall extends BaseCall {
  disconnect: () => void;
  startTime: Date;
  on?: (event: string, listener: (status: string) => void) => void;
  recordingUrl?: string;
}

export function PhoneHUD() {
  const [status, setStatus] = useState<PhoneStatus>('unavailable')
  const [showCallDialog, setShowCallDialog] = useState(false)
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null)
  const [incomingCallInfo, setIncomingCallInfo] = useState<{
    isDirectLine: boolean;
    groupName?: string;
    callerName?: string;
    callerNumber: string;
  } | null>(null)
  const [originalCallerNumber, setOriginalCallerNumber] = useState<string | null>(null)
  const [phoneNumber, setPhoneNumber] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const voiceService = useRef<VoiceService | null>(null)
  const router = useRouter()

  const cleanupCallState = async () => {
    try {
      // Clean up call states
      setActiveCall(null);
      setIncomingCall(null);
      setIncomingCallInfo(null);
      setStatus('available');
      setOriginalCallerNumber(null);
      setPhoneNumber("");
      setShowCallDialog(false);
      
      // Use a try-catch block for the voice service cleanup
      try {
        await voiceService.current?.setCallState(false);
      } catch (error) {
        console.error('Error in voice service cleanup:', error);
      }
    } catch (error) {
      console.error('Error in cleanup:', error);
    }
  }

  useEffect(() => {
    const initializeVoice = async () => {
      setIsLoading(true);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.log('No session found, skipping voice initialization');
          setIsLoading(false);
          return;
        }

        try {
          console.log('Initializing voice service...');
          voiceService.current = new VoiceService();
          const device = await voiceService.current.initialize();
          console.log('Voice service initialized successfully');
          
          await voiceService.current.updateAvailability(status);
          setIsLoading(false);

          // Set up incoming call handler
          if (device && typeof device.on === 'function') {
            device.on('incoming', async (connection) => {
              console.log('Incoming call received:', {
                connection,
                parameters: connection.parameters,
                status: connection.status
              });
              
              setIncomingCall(connection);
              // Don't change status here, just show the incoming call UI

              // Get call details
              const calledNumber = connection.parameters.To;
              const fromNumber = connection.parameters.From;
              const isDirectLine = connection.parameters.DirectLine === 'true';

              console.log('Call details:', {
                calledNumber,
                fromNumber,
                isDirectLine
              });

              // If this is a direct call to a client, use the stored original caller number
              const callerNumber = calledNumber.startsWith('client:') && originalCallerNumber 
                ? originalCallerNumber 
                : fromNumber;

              // Look up caller in users table - try multiple phone number formats
              const normalizedNumber = callerNumber.replace(/\D/g, ''); // Remove all non-digit characters
              const numberWithoutCountryCode = normalizedNumber.replace(/^1/, ''); // Remove leading 1 if present
              
              console.log('Looking up user with phone number:', {
                originalNumber: callerNumber,
                normalizedNumber,
                numberWithoutCountryCode
              });

              const { data: callers, error: lookupError } = await supabase
                .from('users')
                .select('id, first_name, last_name, phone')
                .or(`phone.eq.${numberWithoutCountryCode}`)
                .order('created_at', { ascending: false });

              console.log('User lookup results:', {
                callers,
                error: lookupError,
                query: `phone.eq.${numberWithoutCountryCode}`,
                numberUsed: numberWithoutCountryCode
              });

              // If this is the original incoming call, store the caller's number
              if (!calledNumber.startsWith('client:')) {
                setOriginalCallerNumber(fromNumber);
              }

              // Set the incoming call info with the caller's information
              // Use the most recent user if multiple matches are found
              const caller = callers?.[0];
              const callInfo = {
                isDirectLine,
                groupName: !isDirectLine ? 'admissions' : undefined,
                callerName: caller ? `${caller.first_name} ${caller.last_name}` : numberWithoutCountryCode,
                callerNumber: numberWithoutCountryCode
              };
              
              console.log('Setting incoming call info:', callInfo);
              setIncomingCallInfo(callInfo);

              // Set up call status change handler
              if (connection && typeof connection.on === 'function') {
                connection.on('status', (status: string) => {
                  console.log('Call status changed:', status);
                  if (status === 'closed' || status === 'completed') {
                    console.log('Call ended, cleaning up...');
                    setActiveCall(null);
                    setIncomingCall(null);
                    setIncomingCallInfo(null);
                    setStatus('available');
                    setOriginalCallerNumber(null);
                    voiceService.current?.setCallState(false);
                  }
                });
              }
            });

            // Set up call disconnect handler
            device.on('disconnect', () => {
              console.log('Call disconnected');
              setActiveCall(null);
              setIncomingCall(null);
              setIncomingCallInfo(null);
              setStatus('available');
              setOriginalCallerNumber(null);  // Clear the stored caller number
              voiceService.current?.setCallState(false);
            });
          } else {
            console.error('Device not properly initialized or missing event handlers');
          }
        } catch (error) {
          console.error('Error initializing voice:', error);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error getting session:', error);
        setIsLoading(false);
      }
    };

    initializeVoice();

    return () => {
      if (voiceService.current) {
        voiceService.current.disconnect();
      }
    };
  }, [originalCallerNumber, status, router]);

  const handleAnswerCall = async () => {
    if (incomingCall) {
      try {
        console.log('Answering call:', incomingCall);
        await incomingCall.accept()
        
        // Create a new ActiveCall from the IncomingCall
        const newActiveCall: ActiveCall = {
          sid: incomingCall.sid,
          status: incomingCall.status,
          startTime: new Date(),
          disconnect: () => {
            voiceService.current?.disconnect();
          }
        }
        console.log('Setting active call:', newActiveCall);
        setActiveCall(newActiveCall)
        setIncomingCall(null)
        await voiceService.current?.setCallState(true)

        // Set up call status change handler for the active call
        if (newActiveCall && typeof newActiveCall.on === 'function') {
          newActiveCall.on('status', (status: string) => {
            console.log('Call status changed:', status);
            if (status === 'closed' || status === 'completed' || status === 'disconnected') {
              console.log('Call ended, cleaning up...');
              cleanupCallState();
              handleCallEnd(newActiveCall.sid);
            }
          });
        }

        // Add screen pop functionality
        if (incomingCallInfo?.callerNumber) {
          const normalizedNumber = incomingCallInfo.callerNumber.replace(/\D/g, '');
          const { data: users } = await supabase
            .from('users')
            .select('id')
            .or(`phone.eq.${normalizedNumber}`)
            .order('created_at', { ascending: false })
            .limit(1);

          if (users && users.length > 0) {
            console.log('Navigating to user:', users[0].id);
            router.push(`/users/${users[0].id}`);
          }
        }
      } catch (error) {
        console.error('Error answering call:', error)
        cleanupCallState();
      }
    }
  }

  const handleRejectCall = async () => {
    if (incomingCall) {
      try {
        incomingCall.reject()
        setIncomingCall(null)
        // Use setCallState instead of updateAvailability
        await voiceService.current?.setCallState(false)
      } catch (error) {
        console.error('Error rejecting call:', error)
      }
    }
  }

  const handleMakeCall = async () => {
    if (!voiceService.current || !phoneNumber) return

    try {
      const connection = await voiceService.current.makeCall(phoneNumber)
      setActiveCall(connection)
      setShowCallDialog(false)
      // Use setCallState instead of updateAvailability
      await voiceService.current.setCallState(true)

      connection.on('disconnect', () => {
        setActiveCall(null)
        // Use setCallState instead of updateAvailability
        voiceService.current?.setCallState(false)
      })
    } catch (error) {
      console.error('Error making call:', error)
    }
  }

  const handleEndCall = async () => {
    if (activeCall) {
      try {
        console.log('Ending call:', activeCall);
        
        // Store the call SID before any cleanup
        const callSid = activeCall.sid;
        console.log('Stored call SID for end call:', callSid);
        
        // Disconnect the call first
        activeCall.disconnect();
        
        // Then clean up the UI state
        await cleanupCallState();
        
        // Finally handle the call end with the stored SID
        if (callSid) {
          console.log('Handling call end with SID:', callSid);
          await handleCallEnd(callSid);
        } else {
          console.error('No call SID available when ending call');
        }
      } catch (error) {
        console.error('Error ending call:', error);
        await cleanupCallState();
      }
    }
  }

  const handleCallEnd = async (callSid: string) => {
    console.log('Handling call end with callSid:', callSid);
    
    if (!callSid) {
      console.error('No call_sid available for call end');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.error('No authenticated user found');
        return;
      }

      console.log('Session user:', session.user);

      // Calculate call duration (in seconds)
      const startTime = activeCall?.startTime || new Date();
      const endTime = new Date();
      const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

      console.log('Call duration:', duration);

      // First, check if a call record already exists for this call_sid
      const { data: call, error } = await supabase
        .from('calls')
        .select('*')
        .eq('call_sid', callSid)
        .single();

      if (error) {
        console.error('Error finding call:', error);
        return;
      }

      if (call) {
        console.log('Call record already exists, skipping creation');
        return;
      }

      // Create a new call record
      const { data: newCall, error: createError } = await supabase
        .from('calls')
        .insert({
          call_sid: callSid,
          user_id: session.user.id,
          status: 'completed',
          from_number: incomingCallInfo?.callerNumber || phoneNumber,
          to_number: incomingCallInfo?.isDirectLine ? 'Direct Line' : 'Ring Group',
          duration: duration,
          updated_at: new Date().toISOString(),
          recording_url: activeCall?.recordingUrl
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating call record:', createError);
        return;
      }

      console.log('Created new call record:', newCall);

      // For inbound calls, we want to use the original caller's number
      const isInbound = incomingCallInfo !== null;
      const fromAddress = isInbound ? incomingCallInfo?.callerNumber : phoneNumber;
      const toAddress = isInbound ? (incomingCallInfo?.isDirectLine ? 'Direct Line' : 'Ring Group') : phoneNumber;

      const communicationData = {
        communication_type: 'call',
        communication_type_id: newCall.id,
        direction: isInbound ? 'inbound' : 'outbound',
        from_address: fromAddress,
        to_address: toAddress,
        content: `Call with ${incomingCallInfo?.callerName || phoneNumber} (${duration} seconds)${newCall.recording_url ? '\nRecording available' : ''}`,
        delivered_at: new Date().toISOString(),
        agent_id: session.user.id,
        user_id: newCall.user_id
      };

      console.log('Attempting to create communication record with data:', communicationData);

      // Create a communication record for the call
      const { data: commData, error: commError } = await supabase
        .from('communications')
        .insert(communicationData)
        .select()
        .single();

      if (commError) {
        console.error('Error creating communication:', commError);
        console.error('Error details:', {
          message: commError.message,
          details: commError.details,
          hint: commError.hint,
          code: commError.code
        });
        
        // Try to create the communication record again after a short delay
        setTimeout(async () => {
          try {
            console.log('Retrying communication creation with data:', communicationData);
            const { data: retryData, error: retryError } = await supabase
              .from('communications')
              .insert(communicationData)
              .select()
              .single();
            
            if (retryError) {
              console.error('Error retrying communication creation:', retryError);
              console.error('Retry error details:', {
                message: retryError.message,
                details: retryError.details,
                hint: retryError.hint,
                code: retryError.code
              });
            } else {
              console.log('Successfully created communication record on retry:', retryData);
            }
          } catch (retryError) {
            console.error('Error in retry attempt:', retryError);
          }
        }, 1000);
      } else {
        console.log('Successfully created communication record:', commData);
      }
    } catch (error) {
      console.error('Error logging call:', error);
    }
  }

  const handleStatusChange = async (newStatus: PhoneStatus) => {
    if (status === newStatus) return

    try {
      setStatus(newStatus)
      if (voiceService.current) {
        // Only use updateAvailability for available/unavailable states
        if (newStatus !== 'busy') {
          await voiceService.current.updateAvailability(newStatus)
        }
      } else {
        console.warn('Voice service not initialized, attempting to initialize...')
        voiceService.current = new VoiceService()
        await voiceService.current.initialize()
        if (newStatus !== 'busy') {
          await voiceService.current.updateAvailability(newStatus)
        }
      }
    } catch (error) {
      console.error('Error updating status:', error)
      // Reset status on error
      setStatus('unavailable')
    }
  }

  if (isLoading) {
    return (
      <div className="fixed bottom-4 right-4 flex flex-col gap-4">
        <div className="flex gap-2 bg-white p-2 rounded-lg shadow-lg">
          <Button
            variant="ghost"
            size="icon"
            className="bg-gray-100 text-gray-600 hover:bg-gray-200"
            disabled
          >
            <Circle className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="bg-gray-100 text-gray-600 hover:bg-gray-200"
            disabled
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="bg-gray-100 text-gray-600 hover:bg-gray-200"
            disabled
          >
            <PhoneOff className="h-4 w-4" />
          </Button>
        </div>
        <Button
          className="p-4 rounded-full bg-gray-500 text-white shadow-lg"
          disabled
        >
          <Phone className="h-6 w-6" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-4">
      {/* Status Selection */}
      <div className="flex gap-2 bg-white p-2 rounded-lg shadow-lg">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "rounded-full",
            status === 'available' && "bg-green-100 text-green-600 hover:bg-green-200"
          )}
          onClick={() => handleStatusChange('available')}
        >
          <Circle className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "rounded-full",
            status === 'busy' && "bg-red-100 text-red-600 hover:bg-red-200"
          )}
          onClick={() => handleStatusChange('busy')}
        >
          <X className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "rounded-full",
            status === 'unavailable' && "bg-gray-100 text-gray-600 hover:bg-gray-200"
          )}
          onClick={() => handleStatusChange('unavailable')}
        >
          <PhoneOff className="h-4 w-4" />
        </Button>
      </div>

      {/* Incoming Call */}
      {incomingCall && incomingCallInfo && (
        <div className="bg-white p-4 rounded-lg shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PhoneIncoming className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-sm font-medium">
                  {incomingCallInfo.callerName || incomingCallInfo.callerNumber}
                </p>
                <p className="text-xs text-muted-foreground">
                  {incomingCallInfo.isDirectLine ? 'Direct Line' : `Ring Group: ${incomingCallInfo.groupName}`}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="bg-green-100 text-green-600 hover:bg-green-200"
                onClick={handleAnswerCall}
              >
                <Phone className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="bg-red-100 text-red-600 hover:bg-red-200"
                onClick={handleRejectCall}
              >
                <PhoneOff className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Active Call */}
      {activeCall && incomingCallInfo && (
        <div className="bg-white p-4 rounded-lg shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PhoneIncoming className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-sm font-medium">
                  {incomingCallInfo.callerName || incomingCallInfo.callerNumber}
                </p>
                <p className="text-xs text-muted-foreground">
                  {incomingCallInfo.isDirectLine ? 'Direct Line' : `Ring Group: ${incomingCallInfo.groupName}`}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="bg-red-100 text-red-600 hover:bg-red-200"
              onClick={handleEndCall}
            >
              <PhoneOff className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Make Call Button */}
      {!activeCall && !incomingCall && (
        <Button
          className="p-4 rounded-full bg-blue-500 text-white shadow-lg"
          onClick={() => setShowCallDialog(true)}
        >
          <Phone className="h-6 w-6" />
        </Button>
      )}

      {/* Call Dialog */}
      <Dialog open={showCallDialog} onOpenChange={setShowCallDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Make a Call</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="tel"
                placeholder="Enter phone number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
              <Button onClick={handleMakeCall} disabled={!phoneNumber}>
                <PhoneOutgoing className="h-4 w-4 mr-2" />
                Call
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
} 