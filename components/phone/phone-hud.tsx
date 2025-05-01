"use client";

import { useState, useEffect, useRef } from "react"
import { Phone, PhoneOff, PhoneOutgoing, Circle, Clock, Timer } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { VoiceService } from "@/services/voice.service"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn, AgentStatus } from "@/lib/utils"
import { useRouter } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/realtime-js'
import type { Database } from '@/types/supabase'

type UserPhoneStatus = Database['public']['Tables']['user_phone_status']['Row'];

type PhoneStatus = AgentStatus;

// Define a minimal interface for Twilio Connection-like objects
interface TwilioConnectionLike {
  sid: string;
  status: string;
  parameters: Record<string, string>;
  accept: () => Promise<void>;
  reject: () => void;
  disconnect: () => void;
  cancel: () => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
}

// Update interfaces based on the minimal TwilioConnectionLike type
interface BaseCall {
  sid: string;
  status: string;
  parameters: Record<string, string>;
}

// ActiveCall represents a Connection object after it's accepted
interface ActiveCall extends BaseCall, Pick<TwilioConnectionLike, 'disconnect' | 'on'> {
  startTime: Date;
  recordingUrl?: string;
}

export function PhoneHUD() {
  const [status, setStatus] = useState<PhoneStatus>(AgentStatus.UNAVAILABLE)
  const [showCallDialog, setShowCallDialog] = useState(false)
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)
  const [incomingCall, setIncomingCall] = useState<TwilioConnectionLike | null>(null)
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
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const router = useRouter()
  const statusRef = useRef(status)

  // State for active call timer
  const [callDurationSeconds, setCallDurationSeconds] = useState(0)

  // --- Draggable State ---
  const initialPosition = { x: 16, y: window.innerHeight - 100 }; // Approx bottom-left (adjust y offset as needed)
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartOffset, setDragStartOffset] = useState({ x: 0, y: 0 });
  const hudRef = useRef<HTMLDivElement>(null); // Ref for the main HUD element
  // -----------------------

  // Effect to keep the ref updated whenever the status state changes
  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionUserId(session?.user?.id ?? null);
    });
  }, []);

  const syncAgentStatusWithBackend = async (newStatus: AgentStatus) => {
    console.log(`[Sync] Updating backend status to: ${newStatus}`);
    // TODO: Implement actual API call or WebSocket message to update backend
    // Example: await fetch('/api/agent/status', { method: 'POST', body: JSON.stringify({ status: newStatus }) });
  };

  const cleanupCallState = async () => {
    try {
      // Clean up call states
      setActiveCall(null);
      setIncomingCall(null);
      setIncomingCallInfo(null);
      setOriginalCallerNumber(null);
      setPhoneNumber("");
      setShowCallDialog(false);
      
      // Use a try-catch block for the voice service cleanup
      try {
        // REMOVED: No need to set call state here, status is managed separately
        // await voiceService.current?.setCallState(false);
      } catch (error) {
        console.error('Error in voice service cleanup:', error);
      }
    } catch (error) {
      console.error('Error in cleanup:', error);
    }
  }

  useEffect(() => {
    if (!sessionUserId) return;

    let isMounted = true;

    const initializeVoice = async () => {
      setIsLoading(true);
      try {
        console.log('Initializing voice service for user:', sessionUserId);
        voiceService.current = new VoiceService();
        const device = await voiceService.current.initialize();
        console.log('Voice service initialized successfully');

        if (!isMounted) return;

        await voiceService.current.updateAvailability(statusRef.current);
        setIsLoading(false);

        if (device && typeof device.on === 'function') {
          device.on('incoming', async (connection: TwilioConnectionLike) => {
            console.log('Incoming call received. Current agent status:', statusRef.current);

            if (statusRef.current !== AgentStatus.AVAILABLE) {
              console.warn(`Incoming call received while status is ${statusRef.current}. Rejecting call.`);
              connection.reject();
              return;
            }

            console.log('Agent is available. Processing incoming call:', {
              parameters: connection.parameters,
              status: connection.status
            });

            setIncomingCall(connection);

            const calledNumber = connection.parameters.To;
            const fromNumber = connection.parameters.From;
            const isDirectLine = connection.parameters.DirectLine === 'true';

            console.log('Call details:', {
              calledNumber,
              fromNumber,
              isDirectLine
            });

            const callerNumber = calledNumber.startsWith('client:') && originalCallerNumber 
              ? originalCallerNumber 
              : fromNumber;

            const normalizedNumber = callerNumber.replace(/\D/g, '');
            const numberWithoutCountryCode = normalizedNumber.replace(/^1/, '');
            
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

            if (!calledNumber.startsWith('client:')) {
              setOriginalCallerNumber(fromNumber);
            }

            const caller = callers?.[0];
            const callInfo = {
              isDirectLine,
              groupName: !isDirectLine ? 'admissions' : undefined,
              callerName: caller ? `${caller.first_name} ${caller.last_name}` : numberWithoutCountryCode,
              callerNumber: numberWithoutCountryCode
            };
            
            console.log('Setting incoming call info:', callInfo);
            setIncomingCallInfo(callInfo);

            connection.on('disconnect', async () => {
              console.log('Incoming call disconnected before answer (disconnect event)');
              await cleanupCallState();
              if (statusRef.current !== AgentStatus.BUSY) {
                setStatus(AgentStatus.AVAILABLE);
                await syncAgentStatusWithBackend(AgentStatus.AVAILABLE);
              } else {
                setStatus(AgentStatus.WRAP_UP);
                await syncAgentStatusWithBackend(AgentStatus.WRAP_UP);
              }
            });
            connection.on('cancel', async () => {
              console.log('Incoming call cancelled by caller');
              await cleanupCallState();
              setStatus(AgentStatus.AVAILABLE);
              await syncAgentStatusWithBackend(AgentStatus.AVAILABLE);
            });
            connection.on('reject', async () => {
              console.log('Incoming call rejected (locally or remotely)');
              await cleanupCallState();
              setStatus(AgentStatus.AVAILABLE);
              await syncAgentStatusWithBackend(AgentStatus.AVAILABLE);
            });
          });

          device.on('disconnect', async () => {
            console.log('Device disconnected event');
            await cleanupCallState();
            setStatus(AgentStatus.WRAP_UP);
            await syncAgentStatusWithBackend(AgentStatus.WRAP_UP);
          });
        } else {
          console.error('Device not properly initialized or missing event handlers');
        }
      } catch (error) {
        console.error('Error initializing voice:', error);
        setIsLoading(false);
        await syncAgentStatusWithBackend(AgentStatus.UNAVAILABLE);
      }
    };

    initializeVoice();

    return () => {
      isMounted = false;
      if (voiceService.current) {
        voiceService.current.disconnect();
      }
    };
  }, [sessionUserId, originalCallerNumber]);

  useEffect(() => {
    if (!sessionUserId) return;

    let realtimeChannel: RealtimeChannel | null = null;

    const setupRealtime = () => {
      console.log(`Setting up Realtime subscription for user_phone_status on user: ${sessionUserId}`);
      realtimeChannel = supabase.channel(`realtime-status-${sessionUserId}`)
        .on<UserPhoneStatus>('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_phone_status',
          filter: `user_id=eq.${sessionUserId}`
        }, (payload) => {
          console.log('Realtime: Update received', payload);
          const newDbStatus = payload.new.status as AgentStatus | undefined;

          if (!newDbStatus) {
            console.warn('Realtime: Received update payload without new status.');
            return;
          }

          // Use functional update with ref comparison
          setStatus(currentLocalStatus => { // currentLocalStatus is defined here
             const latestStatusRef = statusRef.current;
             if (newDbStatus !== latestStatusRef) { // Compare DB status with latest ref status
                console.log(`Realtime: Updating local status from ${latestStatusRef} to ${newDbStatus}`);
                return newDbStatus;
             }
             // If no change needed, return the status we got from the state updater
             return currentLocalStatus; 
          });
        })
        .subscribe((subscribeStatus, err) => {
          if (subscribeStatus === 'SUBSCRIBED') {
            console.log(`Realtime subscribed for user: ${sessionUserId}`);
          }
          if (err) {
            console.error(`Error subscribing to realtime status for user ${sessionUserId}:`, err);
          }
        });
    };

    setupRealtime();

    return () => {
      if (realtimeChannel) {
        console.log(`Removing Realtime channel: realtime-status-${sessionUserId}`);
        supabase.removeChannel(realtimeChannel)
          .catch(err => console.error('Error removing realtime channel:', err));
        realtimeChannel = null;
      }
    };
  }, [sessionUserId]);

  // Effect for active call timer
  useEffect(() => {
    let timerInterval: NodeJS.Timeout | null = null;
    if (activeCall?.startTime) {
      const updateTimer = () => {
        // Ensure startTime is valid before calculating
        if (activeCall.startTime instanceof Date && !isNaN(activeCall.startTime.getTime())) {
             const seconds = Math.floor((new Date().getTime() - activeCall.startTime.getTime()) / 1000);
             setCallDurationSeconds(seconds >= 0 ? seconds : 0); // Ensure non-negative
        } else {
             console.error("Invalid activeCall.startTime for timer");
             setCallDurationSeconds(0);
             if (timerInterval) clearInterval(timerInterval); // Stop timer if start time invalid
        }
      };
      updateTimer(); // Initial set
      timerInterval = setInterval(updateTimer, 1000);
    } else {
      setCallDurationSeconds(0); // Reset duration if no active call
    }

    // Cleanup interval
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [activeCall]); // Depend on activeCall

  // --- Draggable Handlers ---
  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hudRef.current) return;
    // Prevent dragging text/elements within the handle
    e.preventDefault(); 

    const hudRect = hudRef.current.getBoundingClientRect();
    setDragStartOffset({
      x: e.clientX - hudRect.left, // Offset from element's left edge
      y: e.clientY - hudRect.top,  // Offset from element's top edge
    });
    setIsDragging(true);
  };

  // Effect to add/remove window listeners for dragging
  useEffect(() => {
    // Define handlers inside or wrap external ones in useCallback
    const handleDraggingCallback = (e: MouseEvent) => {
        setPosition({
          x: e.clientX - dragStartOffset.x,
          y: e.clientY - dragStartOffset.y,
        });
    };
    const handleDragEndCallback = () => {
        setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleDraggingCallback);
      window.addEventListener('mouseup', handleDragEndCallback);
      document.body.style.userSelect = 'none';
    } else {
      window.removeEventListener('mousemove', handleDraggingCallback);
      window.removeEventListener('mouseup', handleDragEndCallback);
      document.body.style.userSelect = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleDraggingCallback);
      window.removeEventListener('mouseup', handleDragEndCallback);
      document.body.style.userSelect = ''; 
    };
  // Only depends on isDragging and the offset state used in callbacks
  }, [isDragging, dragStartOffset]); 
  // ---------------------------

  // Helper to format duration
  const formatDuration = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleAnswerCall = async () => {
    if (!incomingCall) return;
    const connectionToAnswer: TwilioConnectionLike = incomingCall;
    try {
      await connectionToAnswer.accept();
      setStatus(AgentStatus.BUSY);
      await syncAgentStatusWithBackend(AgentStatus.BUSY);

      const newActiveCallState: ActiveCall = {
        sid: connectionToAnswer.sid,
        status: connectionToAnswer.status,
        parameters: connectionToAnswer.parameters,
        startTime: new Date(),
        disconnect: () => connectionToAnswer.disconnect(),
        on: (event, listener) => connectionToAnswer.on(event, listener),
      }
      console.log('Setting active call state:', newActiveCallState);
      setActiveCall(newActiveCallState);
      setIncomingCall(null);

      connectionToAnswer.on('disconnect', async () => {
        console.log('Active call disconnected via connection event');
        await cleanupCallState();
        setStatus(AgentStatus.WRAP_UP);
        await syncAgentStatusWithBackend(AgentStatus.WRAP_UP);
        await handleCallEnd(connectionToAnswer.sid);
      });

      connectionToAnswer.on('cancel', () => {});
      connectionToAnswer.on('reject', () => {});

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
      console.error('Error answering call:', error);
      await cleanupCallState();
      setStatus(AgentStatus.WRAP_UP);
      await syncAgentStatusWithBackend(AgentStatus.WRAP_UP);
    }
  }

  const handleRejectCall = async () => {
    if (!incomingCall) return;
    const callToReject: TwilioConnectionLike = incomingCall;
    try {
      callToReject.reject();
      setIncomingCall(null);
    } catch (error) {
      console.error('Error rejecting call:', error);
    }
  }

  const handleMakeCall = async () => {
    if (!voiceService.current || !phoneNumber) return

    try {
      const connection = await voiceService.current.makeCall(phoneNumber)
      // Set status to BUSY immediately when making an outbound call
      setStatus(AgentStatus.BUSY);
      await syncAgentStatusWithBackend(AgentStatus.BUSY);
      // Assuming makeCall returns a Connection-like object for outbound calls too
      const outboundConnection = connection as ActiveCall; // Cast needed?

      setActiveCall(outboundConnection); // Store the connection object
      setShowCallDialog(false)

      // Attach disconnect handler for the outbound call
      outboundConnection.on('disconnect', async () => {
        console.log('Outbound call disconnected.');
        await cleanupCallState();
        setStatus(AgentStatus.WRAP_UP);
        await syncAgentStatusWithBackend(AgentStatus.WRAP_UP);
        // Handle call end logic if needed
        await handleCallEnd(outboundConnection.sid);
      })
    } catch (error) {
      console.error('Error making call:', error)
      // If making call fails, revert status (e.g., back to AVAILABLE?)
      setStatus(AgentStatus.AVAILABLE); // Or previous status? Needs thought.
      await syncAgentStatusWithBackend(AgentStatus.AVAILABLE);
    }
  }

  const handleEndCall = async () => {
    if (activeCall) {
      try {
        console.log('Ending call:', activeCall);
        const callSid = activeCall.sid;
        activeCall.disconnect();

        if (callSid) {
          await handleCallEnd(callSid);
        }
      } catch (error) {
        console.error('Error ending call:', error);
        await cleanupCallState();
        setStatus(AgentStatus.WRAP_UP);
        await syncAgentStatusWithBackend(AgentStatus.WRAP_UP);
      }
    }
  }

  const handleCallEnd = async (callSid: string) => {
    console.log('(Inside handleCallEnd) - Call end logic executed for SID:', callSid);

    if (!callSid) {
      console.error('No call_sid available for call end');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.error('No authenticated user found for call end');
        return;
      }
      const agentUserId = session.user.id;
      console.log('Call ended, agent user:', agentUserId);

      // Determine call direction and involved numbers
      const isInbound = incomingCallInfo !== null;
      const externalPhoneNumber = isInbound ? incomingCallInfo?.callerNumber : phoneNumber;
      const agentPhoneNumber = 'your_agent_twilio_number'; // Replace with actual agent number if available/needed

      // Calculate call duration (ensure activeCall is referenced correctly if needed)
      // Note: activeCall might be null by the time this runs if cleanup happened first
      // Consider passing startTime or duration into this function if necessary.
      // Using a placeholder duration for now.
      const duration = activeCall?.startTime ? Math.floor((new Date().getTime() - activeCall.startTime.getTime()) / 1000) : 0;
      console.log('Call duration (approx):', duration);

      // Prepare data for the 'calls' table insert
      const callInsertData = {
        call_sid: callSid,
        status: 'completed',
        from_number: isInbound ? externalPhoneNumber : agentPhoneNumber, // Adjust as needed
        to_number: isInbound ? agentPhoneNumber : externalPhoneNumber, // Adjust as needed
        from_user_id: isInbound ? null : agentUserId, // Agent initiated outbound call
        to_user_id: isInbound ? agentUserId : null,   // Agent received inbound call
        duration: duration,
        updated_at: new Date().toISOString(),
        recording_url: activeCall?.recordingUrl // This might also be stale
      };

      console.log('Inserting into calls table:', callInsertData);
      const { data: newCall, error: createError } = await supabase
        .from('calls')
        .insert(callInsertData)
        .select()
        .single();

      if (createError) {
        console.error('Error creating call record:', createError);
        // Decide whether to proceed with communication record if call record fails
        return; 
      }
      if (!newCall) {
          console.error('Failed to create call record, newCall is null');
          return;
      }

      console.log('Created new call record:', newCall);

      // --- Look up external user ID --- 
      let externalUserId: string | null = null;
      if (externalPhoneNumber) {
        const normalizedNumber = externalPhoneNumber.replace(/\D/g, '');
        const numberWithoutCountryCode = normalizedNumber.length > 10 ? normalizedNumber.substring(normalizedNumber.length - 10) : normalizedNumber;
        console.log(`Looking up external user for communication record by phone: ${numberWithoutCountryCode}`);
        const { data: externalUsers, error: userLookupError } = await supabase
            .from('users') // Query the public.users table
            .select('id')
            .or(`phone.eq.${numberWithoutCountryCode}`)
            .limit(1);

        if (userLookupError) {
            console.error('Error looking up external user:', userLookupError);
        } else if (externalUsers && externalUsers.length > 0) {
            externalUserId = externalUsers[0].id;
            console.log('Found external user ID:', externalUserId);
        } else {
            console.log('No external user found for phone number:', externalPhoneNumber);
        }
      } else {
          console.warn('Cannot look up external user, phone number is missing.');
      }
      // --- End lookup ---

      // Prepare data for the 'communications' table insert
      const communicationData = {
        communication_type: 'call',
        communication_type_id: newCall.id, // Use the ID from the inserted call record
        direction: isInbound ? 'inbound' : 'outbound',
        from_address: callInsertData.from_number, // Use consistent numbers
        to_address: callInsertData.to_number,     // Use consistent numbers
        content: `Call ${isInbound ? 'from' : 'to'} ${externalPhoneNumber || 'Unknown'} (${duration} seconds)${newCall.recording_url ? '\nRecording available' : ''}`,
        delivered_at: new Date().toISOString(), // Or use call end time?
        agent_id: agentUserId,           // Correctly reference the agent
        user_id: externalUserId          // Use the looked-up external user ID (can be null)
      };

      console.log('Attempting to create communication record with data:', communicationData);
      const { data: commData, error: commError } = await supabase
        .from('communications')
        .insert(communicationData)
        .select()
        .single();

      if (commError) {
        console.error('Error creating communication:', commError);
        // Log detailed error if possible
      } else {
        console.log('Successfully created communication record:', commData);
      }
    } catch (error) {
      // Type check inside the block
      const message = error instanceof Error ? error.message : String(error);
      console.error('Unexpected error in handleCallEnd:', message);
    }
  };

  const handleStatusChange = async (newStatus: AgentStatus) => {
    const currentStatus = status;
    if (currentStatus === AgentStatus.BUSY && newStatus !== AgentStatus.BUSY) {
      console.warn("Cannot change status manually while BUSY.");
      return;
    }
    if (currentStatus === newStatus) {
        console.log(`Status is already ${newStatus}, no change needed.`);
        return;
    }

    console.log(`User changing status from ${currentStatus} to: ${newStatus}`);
    setStatus(newStatus);

    try {
        await voiceService.current?.updateAvailability(newStatus);
    } catch (error) {
        console.error(`Failed to update availability to ${newStatus}. Reverting local state.`, error);
        setStatus(currentStatus);
    }
  };

  if (isLoading) {
    return (
      <div 
        className="fixed flex items-center gap-1 bg-gray-200 p-1 rounded-lg shadow-lg z-50"
        style={{ top: `${initialPosition.y}px`, left: `${initialPosition.x}px` }}
      >
        <span className="text-xs px-2 text-gray-500">Loading...</span>
      </div>
    );
  }

  return (
    <div
      ref={hudRef}
      className="fixed flex flex-col items-start gap-1 z-50" 
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      {(activeCall || incomingCall) && incomingCallInfo && (
        <div className="bg-white p-2 rounded-lg shadow-lg text-xs mb-1 w-full max-w-[200px] truncate">
          <p className="font-medium truncate">
            {incomingCallInfo.callerName || incomingCallInfo.callerNumber}
          </p>
          <p className="text-muted-foreground truncate">
            {activeCall
              ? <span className="flex items-center"><Timer className="h-3 w-3 mr-1"/>{formatDuration(callDurationSeconds)}</span>
              : incomingCallInfo.isDirectLine
                ? 'Incoming Direct'
                : `Incoming: ${incomingCallInfo.groupName || 'Group'}`}
          </p>
        </div>
      )}

      <div
        className="flex items-center gap-1 bg-white p-1 rounded-lg shadow-lg cursor-move"
        onMouseDown={handleDragStart}
      >
        <Button
          variant="ghost"
          size="icon"
          title="Available"
          className={cn(
            "h-7 w-7 rounded-full",
            status === AgentStatus.AVAILABLE && "bg-green-100 text-green-600 hover:bg-green-200",
            status !== AgentStatus.AVAILABLE && "text-gray-400 hover:bg-gray-100"
          )}
          onClick={() => handleStatusChange(AgentStatus.AVAILABLE)}
          disabled={status === AgentStatus.AVAILABLE || status === AgentStatus.BUSY}
        >
          <Circle className="h-4 w-4" />
        </Button>

        {status === AgentStatus.WRAP_UP && (
          <Button
            variant="ghost"
            size="icon"
            title="Wrap Up"
            className={cn(
              "h-7 w-7 rounded-full bg-orange-100 text-orange-600 cursor-not-allowed"
            )}
            disabled
          >
            <Clock className="h-4 w-4" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          title="Unavailable"
          className={cn(
            "h-7 w-7 rounded-full",
            status === AgentStatus.UNAVAILABLE && "bg-gray-100 text-gray-600 hover:bg-gray-200",
            status !== AgentStatus.UNAVAILABLE && status !== AgentStatus.WRAP_UP && "text-gray-400 hover:bg-gray-100"
          )}
          onClick={() => handleStatusChange(AgentStatus.UNAVAILABLE)}
          disabled={status === AgentStatus.BUSY || status === AgentStatus.UNAVAILABLE}
        >
          <PhoneOff className="h-4 w-4" />
        </Button>

        <div className="h-5 w-px bg-gray-200 mx-1"></div>

        {incomingCall ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              title="Answer Call"
              className="h-7 w-7 rounded-full bg-green-100 text-green-600 hover:bg-green-200"
              onClick={handleAnswerCall}
            >
              <Phone className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Reject Call"
              className="h-7 w-7 rounded-full bg-red-100 text-red-600 hover:bg-red-200"
              onClick={handleRejectCall}
            >
              <PhoneOff className="h-4 w-4" />
            </Button>
          </>
        ) : activeCall ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              title="End Call"
              className="h-7 w-7 rounded-full bg-red-100 text-red-600 hover:bg-red-200"
              onClick={handleEndCall}
            >
              <PhoneOff className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              title="Make Call"
              className="h-7 w-7 rounded-full text-blue-600 hover:bg-blue-100"
              onClick={() => setShowCallDialog(true)}
            >
              <Phone className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

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