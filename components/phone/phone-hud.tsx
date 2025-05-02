"use client";

import { useState, useEffect, useRef, useCallback } from "react"
import { Phone, PhoneOff, PhoneOutgoing, Circle, Clock, Timer } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { VoiceService } from "@/services/voice.service"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn, AgentStatus } from "@/lib/utils"
import { useRouter } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/realtime-js'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { toast } from 'react-hot-toast'
import emitter from "@/lib/event-emitter"

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
  targetNumber?: string;
}

export function PhoneHUD() {
  // --- Restore Local State ---
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
  const [phoneNumber, setPhoneNumber] = useState("") // For direct dial
  const [isLoading, setIsLoading] = useState(true)
  const voiceService = useRef<VoiceService | null>(null)
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const router = useRouter()
  const statusRef = useRef(status)
  const [callDurationSeconds, setCallDurationSeconds] = useState(0)
  const activeCallRef = useRef(activeCall); // Add ref for activeCall
  // -------------------------

  // --- Draggable State (Keep) ---
  const initialPosition = { x: 16, y: typeof window !== 'undefined' ? window.innerHeight - 100 : 800 };
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartOffset, setDragStartOffset] = useState({ x: 0, y: 0 });
  const hudRef = useRef<HTMLDivElement>(null);
  // -----------------------

  // --- Restore original Effects (init, realtime, timer, statusRef sync) ---
  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionUserId(session?.user?.id ?? null);
    });
  }, []);

  // --- Memoized Handlers --- 
  // Define these first as others depend on them

  const cleanupCallState = useCallback(async () => {
    try {
      setActiveCall(null);
      setIncomingCall(null);
      setIncomingCallInfo(null);
      setOriginalCallerNumber(null);
      setPhoneNumber("");
      setShowCallDialog(false);
      setCallDurationSeconds(0);
    } catch (error) {
       console.error('Error in cleanup:', error as Error);
    }
  }, []);

  const syncAgentStatusWithBackend = useCallback(async (newStatus: AgentStatus) => {
    console.log(`[Sync] Updating backend status to: ${newStatus}`);
    if (!sessionUserId) return;
    try {
        const { error } = await supabase
          .from('user_phone_status')
          .upsert({ user_id: sessionUserId, status: newStatus, last_updated: new Date().toISOString() }, { onConflict: 'user_id' });
        if (error) throw error;
    } catch(err) {
        const error = err as Error;
        console.error("Error syncing agent status to DB:", error);
    }
  }, [sessionUserId]);

  const formatDuration = useCallback((totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, []); // No dependencies for formatDuration

  const handleCallEnd = useCallback(async (callSid: string, finalStatus: string = 'completed') => {
    console.log(`[HUD handleCallEnd] SID: ${callSid}, Status: ${finalStatus}`);
    if (!callSid) return;
    const callEndedTime = new Date();
    const endedCall = activeCallRef.current; 
    const endedInboundInfo = incomingCallInfo; 

    await cleanupCallState(); 
    if (statusRef.current === AgentStatus.BUSY) {
      setStatus(AgentStatus.WRAP_UP);
      await syncAgentStatusWithBackend(AgentStatus.WRAP_UP);
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const agentUserId = session.user.id;

      const isInbound = !!endedInboundInfo;
      const externalPhoneNumber = isInbound ? endedInboundInfo?.callerNumber : endedCall?.targetNumber;
      const agentPhoneNumber = process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER || 'your_agent_twilio_number'; 

      // --- Lookup External User ID *before* creating call data ---
      let externalUserId: string | null = null;
      if (externalPhoneNumber) {
         // Use the number relevant to the external party
         const numberToLookup = isInbound ? (endedInboundInfo?.callerNumber || '') : (endedCall?.targetNumber || '');
         if (numberToLookup) {
             console.log(`[HUD handleCallEnd] Looking up external user for number: ${numberToLookup}`);
             const normalizedNumber = numberToLookup.replace(/\D/g, '');
             // Adjust lookup logic if needed (e.g., different table or formatting)
             const { data: externalUsers, error: userLookupError } = await supabase
                 .from('users') // Assuming external contacts are in 'users'
                 .select('id')
                 .or(`phone.eq.${normalizedNumber},phone.eq.+${normalizedNumber}`)
                 .limit(1);
             
             if (userLookupError) {
                console.error(`[HUD handleCallEnd] Error looking up user by phone ${numberToLookup}:`, userLookupError);
             } else if (externalUsers && externalUsers.length > 0) {
                externalUserId = externalUsers[0].id;
                console.log(`[HUD handleCallEnd] Found external user ${externalUserId} for number ${numberToLookup}`);
             } else {
                console.log(`[HUD handleCallEnd] No external user found for number ${numberToLookup}`);
             }
         } else {
            console.warn('[HUD handleCallEnd] Cannot lookup external user: Relevant phone number is missing.');
         }
      } else {
         console.warn('[HUD handleCallEnd] Cannot lookup external user: External phone number is missing.');
      }
      // --- End External User ID Lookup ---

      const duration = endedCall?.startTime ? Math.floor((callEndedTime.getTime() - endedCall.startTime.getTime()) / 1000) : 0;

      // Provide empty string fallbacks for potentially undefined numbers
      const fromNum = isInbound ? (externalPhoneNumber || '') : (agentPhoneNumber || '');
      const toNum = isInbound ? (agentPhoneNumber || '') : (externalPhoneNumber || '');

      const callInsertData = {
        call_sid: callSid,
        status: finalStatus,
        from_number: fromNum, 
        to_number: toNum, 
        // Set IDs based on direction, now that FK constraint is removed
        from_user_id: isInbound ? null : agentUserId, // Agent for outbound
        to_user_id: isInbound ? agentUserId : externalUserId, // External user for outbound, Agent for inbound
        duration: duration >= 0 ? duration : 0,
        updated_at: callEndedTime.toISOString(),
        started_at: endedCall?.startTime?.toISOString(),
        ended_at: callEndedTime.toISOString(),
        recording_url: endedCall?.recordingUrl, // Still likely null from frontend
      };

      console.log('[HUD] Inserting call record:', callInsertData);
      const { data: newCall, error: createError } = await supabase
        .from('calls')
        .insert(callInsertData)
        .select()
        .single();

      if (createError) throw createError;
      if (!newCall) throw new Error('Failed to create call record');
      console.log('[HUD] Call record created:', newCall.id);

      const communicationData = {
        communication_type: 'call',
        communication_type_id: newCall.id,
        direction: isInbound ? 'inbound' : 'outbound',
        from_address: callInsertData.from_number,
        to_address: callInsertData.to_number,
        content: `Call ${finalStatus}. Duration: ${formatDuration(duration)}. ${newCall.recording_url ? 'Recording available.' : ''}`,
        delivered_at: callEndedTime.toISOString(),
        agent_id: agentUserId,
        user_id: externalUserId 
      };

      console.log('[HUD] Inserting communication:', communicationData);
      const { error: commError } = await supabase.from('communications').insert(communicationData);
      if (commError) throw commError;
      console.log('[HUD] Communication created.');

    } catch (error) {
      console.error('[HUD] Error in handleCallEnd recording:', error as Error);
      toast.error(`Failed to record call details: ${(error as Error).message}`);
    }
  }, [cleanupCallState, syncAgentStatusWithBackend, incomingCallInfo, formatDuration]);

  // Define makeCallFromEvent after its dependencies
  const makeCallFromEvent = useCallback(async (numberToCall: string, contactInfo?: { id?: string; name?: string }) => {
     if (!voiceService.current) {
       toast.error("Phone service not ready.");
       return;
     }
     
     let formattedNumber = numberToCall.trim();
     const digitsOnly = formattedNumber.replace(/\D/g, '');

     if (!formattedNumber.startsWith('+') && digitsOnly.length === 10) {
       formattedNumber = `+1${digitsOnly}`;
       console.log(`[HUD makeCallFromEvent] Formatted number to E.164: ${formattedNumber}`);
     } else if (formattedNumber.startsWith('+') && digitsOnly.length > 10) {
       formattedNumber = `+${digitsOnly}`;
     } else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')){
        formattedNumber = `+${digitsOnly}`;
        console.log(`[HUD makeCallFromEvent] Formatted number starting with 1 to E.164: ${formattedNumber}`);
     }

     console.log(`[HUD makeCallFromEvent] Calling ${formattedNumber} (original: ${numberToCall})...`, contactInfo);
     setStatus(AgentStatus.BUSY);
     await syncAgentStatusWithBackend(AgentStatus.BUSY);
 
     let confirmedCallSid: string | null = null; 
     const dialedNumber = formattedNumber;

     try {
       const connection = await voiceService.current.makeCall(dialedNumber); 
       
       // Use a ref to track if handleCallEnd has been called for this connection
       const callEndHandledRef = { current: false };

       const handleDisconnect = async () => { 
         // Use the SID captured during setup, fall back to active call ref only if necessary
         const sidToUse = confirmedCallSid || activeCallRef.current?.sid;
         console.log(`[HUD handleDisconnect] Triggered. SID to use: ${sidToUse}, confirmedCallSid: ${confirmedCallSid}, callEndHandled: ${callEndHandledRef.current}`);
         
         if (callEndHandledRef.current) {
            console.log(`[HUD handleDisconnect] Call end for SID ${sidToUse || 'unknown'} already handled. Skipping.`);
            return;
         }

         if (sidToUse) { 
           console.log(`[HUD handleDisconnect] Outgoing call ${sidToUse} disconnected normally. Calling handleCallEnd.`);
           callEndHandledRef.current = true; // Mark as handled *before* calling
           await handleCallEnd(sidToUse);
         } else {
           console.log(`[HUD handleDisconnect] Disconnect event fired, but no reliable SID found (confirmed: ${confirmedCallSid}, activeRef: ${activeCallRef.current?.sid}). Attempting cleanup.`);
           // If we were busy but have no SID, transition to wrap-up and cleanup
           if (statusRef.current === AgentStatus.BUSY) { 
                setStatus(AgentStatus.WRAP_UP);
                await syncAgentStatusWithBackend(AgentStatus.WRAP_UP);
                await cleanupCallState();
           } else {
                // If not busy, just cleanup
                await cleanupCallState(); 
           }
         }
       };

       // Define the async logic separately for error handling
       const performErrorHandling = async (error: unknown) => {
         // Use the SID captured during setup, fall back to active call ref only if necessary
         const sidToUse = confirmedCallSid || activeCallRef.current?.sid;
         console.log(`[HUD performErrorHandling] Triggered. SID to use: ${sidToUse}, confirmedCallSid: ${confirmedCallSid}, callEndHandled: ${callEndHandledRef.current}`);
         
         if (callEndHandledRef.current) {
            console.log(`[HUD performErrorHandling] Call end/error for SID ${sidToUse || 'unknown'} already handled. Skipping.`);
            return; // Avoid double handling
         }
         callEndHandledRef.current = true; // Mark as handled *before* proceeding

         const errorMessage = (error instanceof Error) ? error.message : 'Unknown call error'; 
         console.error(`[HUD performErrorHandling] Outgoing call error ${sidToUse ? `SID ${sidToUse}` : '(unknown SID)'}:`, error);
         toast.error(`Call failed: ${errorMessage}`);
         
         if (sidToUse) {
            console.log(`[HUD performErrorHandling] Calling handleCallEnd for failed call SID: ${sidToUse}`);
            await handleCallEnd(sidToUse, 'failed'); 
         } else {
            console.warn(`[HUD performErrorHandling] Error occurred but no reliable SID found. Attempting status reset and cleanup.`);
             // Only revert status if it was BUSY due to *this* call attempt
            if (statusRef.current === AgentStatus.BUSY) { 
                setStatus(AgentStatus.AVAILABLE);
                await syncAgentStatusWithBackend(AgentStatus.AVAILABLE);
            }
            await cleanupCallState(); // General cleanup
         }
       };

       // Create a non-async listener that calls the async logic
       const handleErrorListener = (error: unknown) => {
         console.log("[HUD] handleErrorListener triggered");
         performErrorHandling(error).catch(err => {
           console.error("[HUD] Error within performErrorHandling:", err);
           // Fallback cleanup/status update if error handling itself fails
           if (!callEndHandledRef.current) { // Avoid cleanup if already handled
               callEndHandledRef.current = true; // Mark handled in fallback
               cleanupCallState().catch(cleanupErr => console.error("Error during fallback cleanup:", cleanupErr));
               if (statusRef.current !== AgentStatus.AVAILABLE && statusRef.current !== AgentStatus.WRAP_UP) {
                   setStatus(AgentStatus.AVAILABLE);
                   syncAgentStatusWithBackend(AgentStatus.AVAILABLE).catch(syncErr => console.error("Error during fallback status sync:", syncErr));
               }
           }
         });
       };

       const processCallSetup = (conn: TwilioConnectionLike) => {
         // Prevent re-processing if SID is already confirmed
         if (confirmedCallSid) {
             console.log(`[HUD processCallSetup] Already confirmed SID ${confirmedCallSid}. Skipping.`);
             return;
         }
         const callSid = conn.parameters.CallSid || conn.sid;
         console.log(`[HUD processCallSetup] Event: ${conn.status}. Attempting to confirm SID. Found: ${callSid}`);
         
         if (!callSid) {
            console.error("[HUD processCallSetup] Call setup event fired but no SID found.", conn);
            // Don't trigger full error handling here, wait for potential error/disconnect event
            // toast.error("Call initiation warning: Missing Call SID during setup.");
            return; // Exit early, maybe SID appears later
         }

         console.log(`[HUD processCallSetup] Confirming SID as: ${callSid}`);
         confirmedCallSid = callSid; // Set the confirmed SID
         
         // Update active call state if not already set by another event
         if (!activeCallRef.current || activeCallRef.current.sid !== callSid) {
             const newActiveCall: ActiveCall = {
               sid: callSid,
               status: conn.status || 'initiated',
               parameters: conn.parameters,
               startTime: new Date(),
               disconnect: () => conn.disconnect(), 
               on: (event, listener) => conn.on(event, listener),
               targetNumber: dialedNumber
             };
             console.log(`[HUD processCallSetup] Setting active call state for SID: ${callSid}`);
             setActiveCall(newActiveCall);
         } else {
            console.log(`[HUD processCallSetup] Active call state already exists for SID: ${callSid}.`);
         }
         
         // Close dialer dialog only after SID confirmed
         setShowCallDialog(false); 
         setPhoneNumber("");
       };

       // Attach listeners
       connection.on('accept', (conn: TwilioConnectionLike) => {
         console.log('[HUD Connection Event] accept');
         processCallSetup(conn);
       });      
       connection.on('ringing', (hasEarlyMedia: boolean) => { 
            console.log(`[HUD Connection Event] ringing - Early media: ${hasEarlyMedia}`);
            // Attempt setup on ringing as SID might be available now
            processCallSetup(connection);
       });
       connection.on('disconnect', handleDisconnect);
       connection.on('error', handleErrorListener);
 
     } catch (error) {
       console.error('[HUD] Error initiating call:', error as Error);
       toast.error(`Error making call: ${(error as Error).message}`);
       if (status === AgentStatus.BUSY) { 
          setStatus(AgentStatus.AVAILABLE); 
          await syncAgentStatusWithBackend(AgentStatus.AVAILABLE);
       }
       await cleanupCallState();
     }
   }, [syncAgentStatusWithBackend, cleanupCallState, handleCallEnd, status]); 

  // --- Initialize Voice Service --- 
  useEffect(() => {
    if (!sessionUserId) return;
    let isMounted = true;
    const initializeVoice = async () => {
       setIsLoading(true);
       try {
         console.log('[HUD] Initializing voice service for user:', sessionUserId);
         voiceService.current = new VoiceService();
         const device = await voiceService.current.initialize();
         console.log('[HUD] Voice service initialized successfully');
 
         if (!isMounted) return;
 
         await voiceService.current.updateAvailability(statusRef.current);
         setIsLoading(false);
 
         if (device && typeof device.on === 'function') {
           device.on('incoming', async (connection: TwilioConnectionLike) => {
             console.log('[HUD] Incoming call received. Current agent status:', statusRef.current);
 
             if (statusRef.current !== AgentStatus.AVAILABLE) {
               console.warn(`[HUD] Incoming call received while status is ${statusRef.current}. Rejecting call.`);
               connection.reject();
               return;
             }
 
             console.log('[HUD] Agent is available. Processing incoming call:', {
               parameters: connection.parameters,
               status: connection.status
             });
 
             setIncomingCall(connection);
 
              const calledNumber = connection.parameters.To;
              const fromNumber = connection.parameters.From;
              const isDirectLine = connection.parameters.DirectLine === 'true';
  
              const callerNumber = calledNumber.startsWith('client:') && originalCallerNumber 
                ? originalCallerNumber 
                : fromNumber;
  
              const normalizedNumber = callerNumber.replace(/\D/g, '');
              const numberWithoutCountryCode = normalizedNumber.replace(/^1/, '');
              
              const { data: callers, error: lookupError } = await supabase
                .from('users')
                .select('id, first_name, last_name, phone')
                .or(`phone.eq.${numberWithoutCountryCode}`)
                .order('created_at', { ascending: false });
                
              if (lookupError) {
                console.error("[HUD] Error looking up caller:", lookupError);
              }
  
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
              
              console.log('[HUD] Setting incoming call info:', callInfo);
              setIncomingCallInfo(callInfo);
 
             connection.on('disconnect', async () => {
               console.log('[HUD] Incoming call disconnected before answer');
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
               console.log('[HUD] Incoming call cancelled by caller');
               await cleanupCallState();
               setStatus(AgentStatus.AVAILABLE);
               await syncAgentStatusWithBackend(AgentStatus.AVAILABLE);
             });
             connection.on('reject', async () => {
               console.log('[HUD] Incoming call rejected');
               await cleanupCallState();
               setStatus(AgentStatus.AVAILABLE);
               await syncAgentStatusWithBackend(AgentStatus.AVAILABLE);
             });
           });
 
           device.on('disconnect', async () => {
             console.log('[HUD] Device disconnected event');
             await cleanupCallState();
             setStatus(AgentStatus.WRAP_UP);
             await syncAgentStatusWithBackend(AgentStatus.WRAP_UP);
           });

           // Use unknown for device error handler
           device.on('error', (error: unknown) => {
              console.error('[HUD] Twilio Device Error:', error);
              setIsLoading(false);
              setStatus(AgentStatus.UNAVAILABLE);
              syncAgentStatusWithBackend(AgentStatus.UNAVAILABLE);
              // Type check before accessing message
              const errorMessage = (error instanceof Error) ? error.message : 'Unknown device error';
              toast.error(`Phone connection error: ${errorMessage}`);
           });
         } else {
           console.error('[HUD] Device not properly initialized');
         }
       } catch (error) {
         console.error('[HUD] Error initializing voice:', error as Error);
         setIsLoading(false);
         setStatus(AgentStatus.UNAVAILABLE); 
         syncAgentStatusWithBackend(AgentStatus.UNAVAILABLE);
         toast.error("Failed to initialize phone connection.");
       }
    };
    initializeVoice();
    return () => { isMounted = false; voiceService.current?.disconnect(); };
  }, [sessionUserId, syncAgentStatusWithBackend, cleanupCallState, originalCallerNumber]); 

  // --- Realtime Status Sync --- 
  useEffect(() => {
    if (!sessionUserId) return;
    let realtimeChannel: RealtimeChannel | null = null;
    const setupRealtime = () => {
      realtimeChannel = supabase
        .channel(`realtime-status-${sessionUserId}`)
        .on(
          'postgres_changes', 
          { 
            event: '*',
            schema: 'public', 
            table: 'user_phone_status', 
            filter: `user_id=eq.${sessionUserId}`
          }, 
          (payload: RealtimePostgresChangesPayload<UserPhoneStatus>) => {
            if (!payload.new || !('status' in payload.new)) {
              console.warn('[HUD Realtime] Received payload without new data or status', payload);
              return;
            }
            const newDbStatus = payload.new.status as AgentStatus;
            if (!newDbStatus) return;
            setStatus(currentLocalStatus => {
               const latestStatusRef = statusRef.current;
               if (newDbStatus !== latestStatusRef) { 
                  console.log(`[HUD Realtime] Updating local status from ${latestStatusRef} to ${newDbStatus}`);
                  voiceService.current?.updateAvailability(newDbStatus)
                    .catch(err => console.error("[HUD Realtime] Error updating device availability:", err as Error));
                  return newDbStatus;
               }
               return currentLocalStatus; 
            });
          })
        .subscribe((_status, _err) => { 
          if (_err) {
            console.error(`[HUD Realtime] Subscription error for user ${sessionUserId}:`, _err);
            toast.error("Realtime status connection error.");
          } else {
            console.log(`[HUD Realtime] Subscribed successfully to status changes for user ${sessionUserId}`);
          }
        });
    };
    setupRealtime();
    return () => { if (realtimeChannel) { supabase.removeChannel(realtimeChannel); } };
  }, [sessionUserId]);

  // --- Call Timer --- 
  useEffect(() => {
    let timerInterval: NodeJS.Timeout | null = null;
    if (activeCall?.startTime) {
       const updateTimer = () => {
         if (activeCall.startTime instanceof Date && !isNaN(activeCall.startTime.getTime())) {
              const seconds = Math.floor((new Date().getTime() - activeCall.startTime.getTime()) / 1000);
              setCallDurationSeconds(seconds >= 0 ? seconds : 0);
         } else {
              setCallDurationSeconds(0);
              if (timerInterval) clearInterval(timerInterval);
         }
       };
       updateTimer();
       timerInterval = setInterval(updateTimer, 1000);
    } else {
      setCallDurationSeconds(0);
    }
    return () => { if (timerInterval) clearInterval(timerInterval); };
  }, [activeCall]);

  // --- Event Emitter Listener --- 
  useEffect(() => {
    const handleInitiateCallEvent = ({ phoneNumber, contactInfo }: { phoneNumber: string; contactInfo?: { id?: string; name?: string } }) => {
      console.log(`[HUD Event] Received initiate-call event for: ${phoneNumber}`, contactInfo || '(No contact info)');
      if (status !== AgentStatus.AVAILABLE) {
        toast.error(`Cannot make call while status is ${status}.`);
        return;
      }
      if (activeCall || incomingCall) {
        toast.error("Cannot make call while already in a call.");
        return;
      }
      makeCallFromEvent(phoneNumber, contactInfo);
    };

    emitter.on('initiate-call', handleInitiateCallEvent);

    return () => {
      emitter.off('initiate-call', handleInitiateCallEvent);
    };
  // Now includes makeCallFromEvent
  }, [status, activeCall, incomingCall, makeCallFromEvent]); 

  // --- Draggable Handlers (Keep) ---
  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!hudRef.current) return;
    e.preventDefault(); 
    const hudRect = hudRef.current.getBoundingClientRect();
    setDragStartOffset({ x: e.clientX - hudRect.left, y: e.clientY - hudRect.top });
    setIsDragging(true);
  };

  // Effect to add/remove window listeners for dragging
  useEffect(() => {
    const handleDraggingCallback = (e: MouseEvent) => {
        if (!isDragging) return;
        setPosition({ x: e.clientX - dragStartOffset.x, y: e.clientY - dragStartOffset.y });
    };
    const handleDragEndCallback = () => { setIsDragging(false); };

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
  }, [isDragging, dragStartOffset]); 
  // ---------------------------

  // --- Action Handlers using useCallback --- 
  const handleAnswerCall = useCallback(async () => {
    if (!incomingCall) return;
    const connectionToAnswer = incomingCall;
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
      setActiveCall(newActiveCallState);
      setIncomingCall(null); 

      connectionToAnswer.on('disconnect', async () => {
        console.log('[HUD] Answered call disconnected');
        const sid = connectionToAnswer.sid; // Capture SID
        await cleanupCallState(); 
        setStatus(AgentStatus.WRAP_UP);
        await syncAgentStatusWithBackend(AgentStatus.WRAP_UP);
        if (sid) await handleCallEnd(sid); // Use captured SID
      });

      // Define async logic for error handling separately
      const performAnsweredCallErrorHandling = async (error: unknown, sid: string) => {
        console.error(`[HUD] Answered call error SID ${sid}:`, error);
        // Type check before accessing message
        const errorMessage = (error instanceof Error) ? error.message : 'Unknown answered call error';
        toast.error(`Call error: ${errorMessage}`);
        await cleanupCallState();
        setStatus(AgentStatus.WRAP_UP);
        await syncAgentStatusWithBackend(AgentStatus.WRAP_UP);
        if (sid) await handleCallEnd(sid, 'failed');
      };

      // Create non-async listener
      const handleAnsweredCallErrorListener = (error: unknown) => {
        const sid = connectionToAnswer.sid; // Capture SID here
        console.log(`[HUD] handleAnsweredCallErrorListener triggered for SID: ${sid}`);
        performAnsweredCallErrorHandling(error, sid).catch(err => {
          console.error(`[HUD] Error within performAnsweredCallErrorHandling (SID: ${sid}):`, err);
           // Fallback cleanup/status update
           cleanupCallState().catch(cleanupErr => console.error("Error during fallback cleanup:", cleanupErr));
           if (statusRef.current !== AgentStatus.WRAP_UP) {
               setStatus(AgentStatus.WRAP_UP);
               syncAgentStatusWithBackend(AgentStatus.WRAP_UP).catch(syncErr => console.error("Error during fallback status sync:", syncErr));
           }
        });
      };

      // Use the non-async listener
      connectionToAnswer.on('error', handleAnsweredCallErrorListener);

      if (incomingCallInfo?.callerNumber) {
         const normalizedNumber = incomingCallInfo.callerNumber.replace(/\D/g, '');
         const { data: users } = await supabase.from('users').select('id').or(`phone.eq.${normalizedNumber}`).order('created_at', { ascending: false }).limit(1);
         if (users && users.length > 0) router.push(`/users/${users[0].id}`);
      }
    } catch (error) {
      console.error('[HUD] Error answering call:', error as Error);
      await cleanupCallState();
      setStatus(AgentStatus.WRAP_UP);
      await syncAgentStatusWithBackend(AgentStatus.WRAP_UP);
      toast.error("Failed to answer call.");
    }
  }, [incomingCall, syncAgentStatusWithBackend, cleanupCallState, handleCallEnd, incomingCallInfo, router]);

  const handleRejectCall = useCallback(async () => {
    if (!incomingCall) return;
    const callToReject = incomingCall;
    try {
      callToReject.reject();
      setIncomingCall(null); // Listener in initializeVoice should handle status change
    } catch (error) {
      console.error('[HUD] Error rejecting call:', error as Error);
      toast.error("Failed to reject call.");
    }
  }, [incomingCall]);

  const handleMakeCall = useCallback(async () => {
    // Direct dial handler
    makeCallFromEvent(phoneNumber); 
  }, [makeCallFromEvent, phoneNumber]);

  const handleEndCall = useCallback(async () => {
    const currentActiveCall = activeCallRef.current; 
    if (currentActiveCall && currentActiveCall.sid) {
      try {
        console.log('[HUD] Ending call:', currentActiveCall.sid);
        currentActiveCall.disconnect(); // This should trigger the disconnect listener
      } catch (error: unknown) {
        // Type check before logging specific message
        if (error instanceof Error) {
            console.error('[HUD] Error ending call:', error);
        } else {
            console.error('[HUD] Unknown error ending call:', error);
        }
        const sid = currentActiveCall.sid; // Capture SID before cleanup
        await cleanupCallState(); 
        setStatus(AgentStatus.WRAP_UP);
        await syncAgentStatusWithBackend(AgentStatus.WRAP_UP);
        if (sid) await handleCallEnd(sid, 'failed'); // Use captured SID
        toast.error("Error ending call.");
      }
    } else {
        console.warn("[HUD] handleEndCall clicked but no active call SID found in state.");
        if (statusRef.current === AgentStatus.BUSY) {
            setStatus(AgentStatus.WRAP_UP);
            await syncAgentStatusWithBackend(AgentStatus.WRAP_UP);
            await cleanupCallState();
        }
    }
  }, [cleanupCallState, syncAgentStatusWithBackend, handleCallEnd]); // Dependencies for handleEndCall

  const handleStatusChange = useCallback(async (newStatus: AgentStatus) => {
    const currentStatus = status; 
    if (currentStatus === AgentStatus.BUSY && newStatus !== AgentStatus.BUSY) {
      toast.error("Cannot change status manually while BUSY.");
      return;
    }
    if (currentStatus === newStatus) return;

    console.log(`[HUD] User changing status from ${currentStatus} to: ${newStatus}`);
    setStatus(newStatus);

    try {
      await voiceService.current?.updateAvailability(newStatus);
      await syncAgentStatusWithBackend(newStatus);
    } catch (error) {
      console.error(`[HUD] Failed to update availability to ${newStatus}. Reverting local state.`, error as Error);
      setStatus(currentStatus); // Revert local state on failure
      toast.error(`Failed to update status: ${(error as Error).message}`);
    }
  }, [status, syncAgentStatusWithBackend]); // Dependencies for handleStatusChange

  // Use local isLoading state
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

  // --- Render Original UI structure with Local State ---
  return (
    <div
      ref={hudRef}
      className="fixed flex flex-col items-start gap-1 z-50" 
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      {/* Call Info Display: Use local state */} 
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

      {/* Button Container */} 
      <div
        className="flex items-center gap-1 bg-white p-1 rounded-lg shadow-lg cursor-move"
        onMouseDown={handleDragStart}
      >
        {/* Status Buttons: Use local status & handleStatusChange */} 
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

        {/* Call Action Buttons: Use local state & original handlers */} 
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
            {/* This button opens the original direct dialer dialog */} 
            <Button
              variant="ghost"
              size="icon"
              title="Make Call (Direct Dial)"
              className="h-7 w-7 rounded-full text-blue-600 hover:bg-blue-100"
              onClick={() => setShowCallDialog(true)} 
              // Disable button based on local status/call state
              disabled={status !== AgentStatus.AVAILABLE || !!activeCall || !!incomingCall}
            >
              <Phone className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {/* Original Dialer Dialog */} 
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
              {/* Disable button based on local status/call state */} 
              <Button 
                onClick={handleMakeCall} // Calls makeCallFromEvent(phoneNumber)
                disabled={!phoneNumber || status !== AgentStatus.AVAILABLE || !!activeCall || !!incomingCall}
              > 
                <PhoneOutgoing className="h-4 w-4 mr-2" />
                Call
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 