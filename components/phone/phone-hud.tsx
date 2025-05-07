"use client";

import { useState, useEffect, useRef, useCallback } from "react"
import { Phone, PhoneOff, PhoneOutgoing, Circle, Mic, Grid } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { VoiceService } from "@/services/voice.service"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Toggle as LiquidToggle } from '@/components/ui/liquid-toggle'
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
  off: (event: string, listener: (...args: unknown[]) => void) => void;
  _cleanupListeners?: () => void;
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
  callerName?: string;
  callerNumber?: string;
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
    // Capture state *before* potential cleanup
    const endedCall = activeCallRef.current; 
    const endedInboundInfo = incomingCallInfo; 
    const previousStatus = statusRef.current;

    try {
      // Update status immediately if needed (moved from outside try block)
      if (previousStatus === AgentStatus.BUSY) {
        setStatus(AgentStatus.WRAP_UP);
        await syncAgentStatusWithBackend(AgentStatus.WRAP_UP);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
         console.warn('[HUD handleCallEnd] No session user found. Skipping DB operations.');
         // --- Ensure state cleanup still happens even without session ---
         await cleanupCallState();
         // --- Set status locally even if DB sync fails ---
         if (previousStatus === AgentStatus.BUSY) {
            setStatus(AgentStatus.WRAP_UP);
            // Attempt sync but don't block UI state change
            syncAgentStatusWithBackend(AgentStatus.WRAP_UP).catch(err => {
                console.error("[HUD handleCallEnd] Error syncing wrap-up status:", err);
            });
         } else if (previousStatus !== AgentStatus.UNAVAILABLE) {
            // If call ended but we weren't busy (e.g., failed outbound), revert to available
            setStatus(AgentStatus.AVAILABLE);
             syncAgentStatusWithBackend(AgentStatus.AVAILABLE).catch(err => {
                console.error("[HUD handleCallEnd] Error syncing available status:", err);
            });
         }
         // --- End modifications for no session ---
         return;
      }
      const agentUserId = session.user.id;
      console.log(`[HUD handleCallEnd] Agent user ID: ${agentUserId}`);

      const isInbound = !!endedInboundInfo;
      console.log(`[HUD handleCallEnd] Is Inbound: ${isInbound}`);
      
      // Determine external number based on direction
      const externalPhoneNumber = isInbound ? endedInboundInfo?.callerNumber : endedCall?.targetNumber;
      const agentPhoneNumber = process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER || 'your_agent_twilio_number'; 
      console.log(`[HUD handleCallEnd] External #: ${externalPhoneNumber}, Agent #: ${agentPhoneNumber}`);

      // --- Lookup External User ID *before* creating call data ---
      let externalUserId: string | null = null;
      if (externalPhoneNumber) {
         // Use the number relevant to the external party
         const numberToLookup = externalPhoneNumber; // Simplified
         if (numberToLookup) {
             console.log(`[HUD handleCallEnd] Looking up external user for number: ${numberToLookup}`);
             // Normalize number: remove non-digits, ensure '+' prefix if not present
             let normalizedNumber = numberToLookup.replace(/\D/g, '');
             if (!normalizedNumber.startsWith('+') && normalizedNumber.length >= 10) { // Basic check for common US format without +
                normalizedNumber = '+' + (normalizedNumber.length === 10 ? '1' + normalizedNumber : normalizedNumber);
             } else if (!normalizedNumber.startsWith('+')) {
                normalizedNumber = '+' + normalizedNumber; // Add '+' if missing anyway
             }
             console.log(`[HUD handleCallEnd] Normalized number for lookup: ${normalizedNumber}`);
             
             // Use precise lookup with normalized number
             const { data: externalUsers, error: userLookupError } = await supabase
                 .from('users') 
                 .select('id')
                 .eq('phone', normalizedNumber) // Use exact match with normalized number
                 .limit(1);
             
             if (userLookupError) {
                console.error(`[HUD handleCallEnd] Error looking up user by phone ${normalizedNumber}:`, userLookupError);
             } else if (externalUsers && externalUsers.length > 0) {
                externalUserId = externalUsers[0].id;
                console.log(`[HUD handleCallEnd] Found external user ${externalUserId} for number ${normalizedNumber}`);
             } else {
                console.log(`[HUD handleCallEnd] No external user found for number ${normalizedNumber}`);
             }
         } else {
            console.warn('[HUD handleCallEnd] Cannot lookup external user: Relevant phone number is missing.');
         }
      } else {
         console.warn('[HUD handleCallEnd] Cannot lookup external user: External phone number is missing.');
      }
      // --- End External User ID Lookup ---

      const duration = endedCall?.startTime ? Math.floor((callEndedTime.getTime() - endedCall.startTime.getTime()) / 1000) : 0;
      console.log(`[HUD handleCallEnd] Calculated Duration: ${duration}s`);

      // Provide empty string fallbacks for potentially undefined numbers
      const fromNum = isInbound ? (externalPhoneNumber || '') : (agentPhoneNumber || '');
      const toNum = isInbound ? (agentPhoneNumber || '') : (externalPhoneNumber || '');

      const callInsertData = {
        call_sid: callSid,
        status: finalStatus,
        from_number: fromNum, 
        to_number: toNum, 
        // Set IDs based on direction
        from_user_id: isInbound ? externalUserId : agentUserId, // External for inbound, Agent for outbound
        to_user_id: isInbound ? agentUserId : externalUserId, // Agent for inbound, External for outbound
        duration: duration >= 0 ? duration : 0, // Ensure non-negative duration
        updated_at: callEndedTime.toISOString(),
        started_at: endedCall?.startTime?.toISOString(), // Use optional chaining safely
        ended_at: callEndedTime.toISOString(),
        recording_url: endedCall?.recordingUrl, // Likely null from frontend, status callback should update
        // Ensure direction is set for consistency
        direction: isInbound ? 'inbound' : 'outbound',
      };

      console.log('[HUD] Attempting to insert call record:', JSON.stringify(callInsertData, null, 2));
      
      // Use UPSERT instead of INSERT to handle potential race conditions with status callback
      // Ensure `call_sid` has a unique constraint in your DB schema for upsert to work correctly.
      const { data: upsertedCall, error: upsertError } = await supabase
        .from('calls')
        .upsert(callInsertData, { onConflict: 'call_sid' }) // Upsert based on call_sid
        .select()
        .single();

      if (upsertError) {
         console.error('[HUD] Error upserting call record:', upsertError);
         throw upsertError; // Re-throw to trigger catch block
      }
      if (!upsertedCall) throw new Error('Failed to upsert call record');
      console.log('[HUD] Call record upserted successfully:', upsertedCall.id);

      // --- Create Communication Record ---
      // Ensure we use the potentially updated externalUserId from the lookup
      const communicationData = {
        communication_type: 'call',
        communication_type_id: upsertedCall.id,
        direction: isInbound ? 'inbound' : 'outbound',
        from_address: callInsertData.from_number,
        to_address: callInsertData.to_number,
        content: `Call ${finalStatus}. Duration: ${formatDuration(callInsertData.duration)}. ${upsertedCall.recording_url ? 'Recording available.' : ''}`,
        delivered_at: callEndedTime.toISOString(),
        agent_id: agentUserId, 
        user_id: externalUserId // Use the looked-up externalUserId here
      };

      console.log('[HUD] Inserting communication:', JSON.stringify(communicationData, null, 2));
      const { error: commError } = await supabase.from('communications').insert(communicationData);
      if (commError) {
         console.error('[HUD] Error inserting communication record:', commError);
         throw commError; // Re-throw
      }
      console.log('[HUD] Communication created.');

    } catch (error) {
      console.error('[HUD] Error in handleCallEnd recording steps:', error as Error);
      toast.error(`Failed to record call details: ${(error as Error).message}`);
      // Ensure status is handled even on error if needed
      if (previousStatus === AgentStatus.BUSY && statusRef.current !== AgentStatus.WRAP_UP) {
          setStatus(AgentStatus.WRAP_UP);
          await syncAgentStatusWithBackend(AgentStatus.WRAP_UP);
      }
    } finally {
       // --- MOVE cleanupCallState() call here ---
       console.log('[HUD handleCallEnd] Executing cleanupCallState in finally block.');
       await cleanupCallState(); 
    }
  }, [cleanupCallState, syncAgentStatusWithBackend, incomingCallInfo, formatDuration]); // Dependencies might need adjustment if activeCallRef logic changes

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

       // --- Modified Disconnect Listener --- 
       const handleDisconnect = () => { 
         const sidToUse = confirmedCallSid || activeCallRef.current?.sid;
         console.log(`[HUD handleDisconnect listener Outbound] Triggered. SID: ${sidToUse}, Handled: ${callEndHandledRef.current}`);
         
         if (callEndHandledRef.current) return; 
         callEndHandledRef.current = true; 
         
         console.log(`[HUD handleDisconnect listener Outbound] Call disconnected event received for ${sidToUse}. Calling handleCallEnd(completed).`);
         // --- ADD CALL TO handleCallEnd ---
         if (sidToUse) {
             handleCallEnd(sidToUse, 'completed').catch(err => {
                console.error(`[HUD handleDisconnect Outbound] Error during handleCallEnd:`, err);
                // Fallback cleanup if handleCallEnd fails critically
                cleanupCallState().catch(cleanupErr => console.error("Error during fallback cleanup:", cleanupErr));
                if (statusRef.current !== AgentStatus.WRAP_UP) {
                   setStatus(AgentStatus.WRAP_UP); // Ensure wrap-up status
                   syncAgentStatusWithBackend(AgentStatus.WRAP_UP).catch(syncErr => console.error("Error during fallback status sync:", syncErr));
                }
             });
         } else {
            console.warn("[HUD handleDisconnect Outbound] Disconnect event but no SID confirmed. Performing basic cleanup.");
            cleanupCallState();
             if (statusRef.current !== AgentStatus.WRAP_UP) {
               setStatus(AgentStatus.WRAP_UP); // Ensure wrap-up status
               syncAgentStatusWithBackend(AgentStatus.WRAP_UP);
             }
         }
         // Cleanup and status changes are now primarily handled within handleCallEnd or its finally block
       };

       // Define the async logic separately for error handling
       const performErrorHandling = async (error: unknown) => {
         const sidToUse = confirmedCallSid || activeCallRef.current?.sid;
         console.log(`[HUD performErrorHandling Outbound] Triggered. SID: ${sidToUse}, Handled: ${callEndHandledRef.current}`);
         
         if (callEndHandledRef.current) {
            console.log(`[HUD performErrorHandling Outbound] Call end/error for SID ${sidToUse || 'unknown'} already handled. Skipping.`);
            return; 
         }
         callEndHandledRef.current = true; 

         const errorMessage = (error instanceof Error) ? error.message : 'Unknown call error'; 
         console.error(`[HUD performErrorHandling Outbound] Outgoing call error ${sidToUse ? `SID ${sidToUse}` : '(unknown SID)'}:`, error);
         toast.error(`Call failed: ${errorMessage}`);
         
         // --- ADD CALL TO handleCallEnd ---
         if (sidToUse) {
            console.log(`[HUD performErrorHandling Outbound] Calling handleCallEnd for failed call SID: ${sidToUse}`);
            await handleCallEnd(sidToUse, 'failed'); 
         } else {
            console.warn(`[HUD performErrorHandling Outbound] Error occurred but no reliable SID found. Resetting status & cleaning up.`);
            await cleanupCallState(); // General cleanup
            // Only revert status if it was BUSY due to *this* call attempt
            if (statusRef.current === AgentStatus.BUSY) { 
                setStatus(AgentStatus.AVAILABLE);
                await syncAgentStatusWithBackend(AgentStatus.AVAILABLE);
            }
         }
         // Cleanup and status changes are handled by handleCallEnd
       };

       // Create a non-async listener that calls the async logic
       const handleErrorListener = (error: unknown) => {
         console.log("[HUD handleErrorListener Outbound] triggered");
         performErrorHandling(error).catch(err => {
           console.error("[HUD handleErrorListener Outbound] Error within performErrorHandling:", err);
           // Fallback cleanup/status update if error handling itself fails
           if (!callEndHandledRef.current) { 
               callEndHandledRef.current = true; 
               cleanupCallState().catch(cleanupErr => console.error("Error during fallback cleanup:", cleanupErr));
               // If status is not already AVAILABLE or WRAP_UP, move to WRAP_UP as the call attempt failed.
               if (statusRef.current !== AgentStatus.AVAILABLE && statusRef.current !== AgentStatus.WRAP_UP) {
                   setStatus(AgentStatus.WRAP_UP);
                   syncAgentStatusWithBackend(AgentStatus.WRAP_UP).catch(syncErr => console.error("Error during fallback status sync:", syncErr));
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
               targetNumber: dialedNumber,
               callerName: conn.parameters.CallerName,
               callerNumber: conn.parameters.CallerNumber
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
       });       connection.on('ringing', (hasEarlyMedia: boolean) => { 
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
 
             // Store listeners to remove them later
             const handleIncomingDisconnect = async () => {
               console.log('[HUD] Incoming call disconnected before answer');
               await cleanupCallState();
               // Ensure status is reset appropriately if the call was missed/cancelled
               if (statusRef.current === AgentStatus.AVAILABLE) { // Check if we were available when it disconnected
                  // No status change needed if we were already available
                  console.log('[HUD Incoming Disconnect] Still available, no status change.');
               } else if (statusRef.current !== AgentStatus.BUSY) {
                  // If we somehow became unavailable *while* it was ringing, but weren't busy
                  console.log(`[HUD Incoming Disconnect] Status was ${statusRef.current}, changing to AVAILABLE.`);
                  setStatus(AgentStatus.AVAILABLE);
                  await syncAgentStatusWithBackend(AgentStatus.AVAILABLE);
               }
               // If status was BUSY, handleCallEnd will manage the transition to WRAP_UP
             };
             const handleIncomingCancel = async () => {
               console.log('[HUD] Incoming call cancelled by caller');
               await cleanupCallState();
                // Reset to available only if not busy
               if (statusRef.current !== AgentStatus.BUSY) {
                 setStatus(AgentStatus.AVAILABLE);
                 await syncAgentStatusWithBackend(AgentStatus.AVAILABLE);
               }
             };
             const handleIncomingReject = async () => {
               console.log('[HUD] Incoming call rejected (likely by this agent)');
               await cleanupCallState();
               // Reset to available only if not busy
               if (statusRef.current !== AgentStatus.BUSY) {
                 setStatus(AgentStatus.AVAILABLE);
                 await syncAgentStatusWithBackend(AgentStatus.AVAILABLE);
               }
             };

             connection.on('disconnect', handleIncomingDisconnect);
             connection.on('cancel', handleIncomingCancel);
             connection.on('reject', handleIncomingReject); // Handles explicit rejection via SDK/UI

             // Store the cleanup function
             connection._cleanupListeners = () => {
                connection.off('disconnect', handleIncomingDisconnect);
                connection.off('cancel', handleIncomingCancel);
                connection.off('reject', handleIncomingReject);
                console.log('[HUD] Removed incoming connection listeners.');
             };
           });
 
           device.on('disconnect', async () => {
             console.log('[HUD] Device disconnected event. Potential issue or browser close.');
             // This might indicate the agent closed the browser or lost connection entirely
             // If there was an active call, handleCallEnd should have triggered first.
             // If not, ensure state reflects unavailability.
             if (!activeCallRef.current && statusRef.current !== AgentStatus.UNAVAILABLE) {
                console.log('[HUD Device Disconnect] No active call, setting status to UNAVAILABLE.');
                setStatus(AgentStatus.UNAVAILABLE);
                await syncAgentStatusWithBackend(AgentStatus.UNAVAILABLE);
             }
             await cleanupCallState(); // General cleanup might still be needed
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
            
            // --- Check local status BEFORE updating from DB --- 
            const currentLocalStatus = statusRef.current;
            
            // --- ADDED CHECK: Ignore DB updates if locally BUSY or WRAP_UP --- 
            if (currentLocalStatus === AgentStatus.BUSY || currentLocalStatus === AgentStatus.WRAP_UP) {
              console.log(`[HUD Realtime] Ignoring DB status update (${newDbStatus}) because local status is ${currentLocalStatus}.`);
              return; // Do not update local state based on DB if busy/wrap-up
            }
            // --- END ADDED CHECK ---
            
            setStatus(currentLocalStatus => {
               // Use the already captured currentLocalStatus for comparison here
               if (newDbStatus !== currentLocalStatus) { 
                  console.log(`[HUD Realtime] Updating local status from ${currentLocalStatus} to ${newDbStatus}`);
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
        sid: connectionToAnswer.parameters.CallSid || connectionToAnswer.sid,
        status: connectionToAnswer.status,
        parameters: connectionToAnswer.parameters,
        startTime: new Date(),
        disconnect: () => connectionToAnswer.disconnect(),
        on: (event, listener) => connectionToAnswer.on(event, listener),
        callerName: incomingCallInfo?.callerName,
        callerNumber: incomingCallInfo?.callerNumber
      }
      
      // --- Log the state object before setting it ---
      console.log('[HUD handleAnswerCall] Preparing to set Active Call State:', JSON.stringify(newActiveCallState, (key, value) => 
        typeof value === 'function' ? `[function ${value.name || 'anonymous'}]` : value, 
      2));
      
      setActiveCall(newActiveCallState);
      setIncomingCall(null); 

      // --- Use a ref for handled state --- 
      const callEndHandledRef = { current: false };

      // --- Clean up listeners from the incoming phase --- 
      const cleanupIncomingListeners = (conn: TwilioConnectionLike | null) => {
          if (conn && typeof conn._cleanupListeners === 'function') {
              conn._cleanupListeners();
              delete conn._cleanupListeners;
          }
      };
      cleanupIncomingListeners(connectionToAnswer);
      // ----------------------------------------------

      // --- Modified Disconnect Listener --- 
      connectionToAnswer.on('disconnect', async () => {
        const sidToUse = connectionToAnswer.parameters.CallSid || connectionToAnswer.sid;
        console.log(`[HUD handleDisconnect listener Inbound] Triggered. SID: ${sidToUse}, Handled: ${callEndHandledRef.current}`);
        
        if (callEndHandledRef.current) return;
        callEndHandledRef.current = true;
        
        console.log(`[HUD handleDisconnect listener Inbound] Call disconnected event received for ${sidToUse}. Calling handleCallEnd(completed).`);
        // --- ADD CALL TO handleCallEnd ---
        if (sidToUse) {
           handleCallEnd(sidToUse, 'completed').catch(err => {
              console.error(`[HUD handleDisconnect Inbound] Error during handleCallEnd:`, err);
              // Fallback cleanup
              cleanupCallState().catch(cleanupErr => console.error("Error during fallback cleanup:", cleanupErr));
              if (statusRef.current !== AgentStatus.WRAP_UP) {
                 setStatus(AgentStatus.WRAP_UP);
                 syncAgentStatusWithBackend(AgentStatus.WRAP_UP).catch(syncErr => console.error("Error during fallback status sync:", syncErr));
              }
           });
        } else {
           console.warn("[HUD handleDisconnect Inbound] Disconnect event but no SID found. Performing basic cleanup.");
           cleanupCallState();
            if (statusRef.current !== AgentStatus.WRAP_UP) {
              setStatus(AgentStatus.WRAP_UP);
              syncAgentStatusWithBackend(AgentStatus.WRAP_UP);
            }
        }
      });

      // Define async logic for error handling separately
      const performAnsweredCallErrorHandling = async (error: unknown, sid: string) => {
        console.log(`[HUD performAnsweredCallErrorHandling Inbound] Triggered. SID: ${sid}, Handled: ${callEndHandledRef.current}`);
        if (callEndHandledRef.current) {
           console.log(`[HUD performAnsweredCallErrorHandling Inbound] Error for SID ${sid} already handled. Skipping.`);
           return;
        }
        callEndHandledRef.current = true;
        
        console.error(`[HUD] Answered call error SID ${sid}:`, error);
        const errorMessage = (error instanceof Error) ? error.message : 'Unknown answered call error';
        toast.error(`Call error: ${errorMessage}`);
        
        // --- ADD CALL TO handleCallEnd ---
        console.log(`[HUD performAnsweredCallErrorHandling Inbound] Calling handleCallEnd for failed call SID: ${sid}`);
        await handleCallEnd(sid, 'failed'); // Calls cleanup internally
      };

      // Create non-async listener
      const handleAnsweredCallErrorListener = (error: unknown) => {
        const sid = connectionToAnswer.parameters.CallSid || connectionToAnswer.sid; // Capture SID here
        console.log(`[HUD handleAnsweredCallErrorListener Inbound] triggered for SID: ${sid}`);
        performAnsweredCallErrorHandling(error, sid).catch(err => {
          console.error(`[HUD handleAnsweredCallErrorListener Inbound] Error within performAnsweredCallErrorHandling (SID: ${sid}):`, err);
           // Fallback cleanup/status update if primary handling fails
           if (!callEndHandledRef.current) {
              callEndHandledRef.current = true;
              cleanupCallState().catch(cleanupErr => console.error("Error during fallback cleanup:", cleanupErr));
              if (statusRef.current !== AgentStatus.WRAP_UP) {
                  setStatus(AgentStatus.WRAP_UP);
                  syncAgentStatusWithBackend(AgentStatus.WRAP_UP).catch(syncErr => console.error("Error during fallback status sync:", syncErr));
              }
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
    
    // --- Clean up listeners from the incoming phase --- 
    const cleanupIncomingListeners = (conn: TwilioConnectionLike | null) => {
        if (conn && typeof conn._cleanupListeners === 'function') {
            conn._cleanupListeners();
            delete conn._cleanupListeners;
        }
    };
    cleanupIncomingListeners(callToReject);
    // ----------------------------------------------
    
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

  // --- Define handleEndCall as a regular function to avoid stale closures ---
  const handleEndCall = async () => {
    const callToHangup = activeCall; 

    if (!callToHangup || !callToHangup.sid) {
      console.warn("[HUD] handleEndCall clicked but no active call found in state.");
      return;
    }

    // --- Proceed using `callToHangup` (from state) ---
    // --- DEBUG: Log available SIDs ---
    console.log('[HUD handleEndCall] Active Call State (from state):', JSON.stringify(callToHangup, null, 2));
    console.log('[HUD handleEndCall] Connection SID:', callToHangup.sid);
    console.log('[HUD handleEndCall] Parameters:', JSON.stringify(callToHangup.parameters, null, 2));
    const potentialParentSid = callToHangup.parameters.CallSid;
    console.log('[HUD handleEndCall] Potential Parent SID (from parameters.CallSid):', potentialParentSid);
    // --- END DEBUG ---

    // Attempt to get the primary Call SID (likely the parent SID)
    const sidToHangup = callToHangup.parameters.CallSid || callToHangup.sid;
    console.log(`[HUD handleEndCall] Attempting to hang up call SID: ${sidToHangup}`);

    // --- Initiate backend hangup but DO NOT await it here ---
    fetch('/api/calls/hangup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ callSid: sidToHangup }),
    })
    .then(async response => {
      if (!response.ok) {
        const errorData = await response.json();
        console.error(`[HUD handleEndCall] API hangup failed (async) for SID ${sidToHangup}:`, errorData);
        // Log error but don't necessarily show toast if local disconnect worked
        // toast.error(`API Hangup failed: ${errorData.error || response.statusText}`);
      } else {
        console.log(`[HUD handleEndCall] API hangup successful (async) for SID ${sidToHangup}`);
      }
    })
    .catch(error => {
      console.error('[HUD handleEndCall] Error during background API hangup fetch:', error as Error);
      // Don't toast here either, rely on disconnect listener for user feedback
    });

    // --- Disconnect local client leg immediately --- 
    if (typeof callToHangup.disconnect === 'function') {
      console.log(`[HUD handleEndCall] Disconnecting local client leg immediately for SID: ${callToHangup.sid}`);
      callToHangup.disconnect(); 
    } else {
       console.warn(`[HUD handleEndCall] No local disconnect method found for SID: ${callToHangup.sid}`);
       // If local disconnect isn't possible, we rely solely on the API call
       // Potentially trigger cleanup manually as a fallback?
       // await cleanupCallState(); // Consider if needed here
    }
    
    // Cleanup and status change are handled by the disconnect listener.
    
  }; // End of handleEndCall definition

  // Define the central status change handler
  const handleStatusChange = useCallback(async (newStatus: AgentStatus) => {
    console.log(`[Status Change] Requesting change to: ${newStatus}, Current: ${statusRef.current}`);
    // Update local state immediately for UI responsiveness
    setStatus(newStatus);
    // Sync the new status to the backend database
    await syncAgentStatusWithBackend(newStatus);
    // Optionally update Twilio device availability (if applicable and voiceService is ready)
    if (voiceService.current) {
      await voiceService.current.updateAvailability(newStatus);
    }
  }, [syncAgentStatusWithBackend, setStatus]); // Dependencies: sync function and setter

  const handleLiquidToggleChange = (isOn: boolean) => {
    // Prevent changes if busy (toggle is now visually disabled, but good to double-check)
    const currentStatus = statusRef.current;
    if (currentStatus === AgentStatus.BUSY) {
      console.warn("Attempted to toggle status while BUSY or WRAP_UP");
      return;
    }

    // Only proceed if the target status is different and the transition is valid
    if (isOn) { // Toggled to ON (Available)
      if (currentStatus === AgentStatus.UNAVAILABLE || currentStatus === AgentStatus.WRAP_UP) {
        console.log(`[Toggle] Changing status from ${currentStatus} to AVAILABLE`);
        handleStatusChange(AgentStatus.AVAILABLE);
      } else {
         console.log(`[Toggle] No change needed. Already ${currentStatus} when toggled ON.`);
      }
    } else { // Toggled to OFF (Unavailable)
      if (currentStatus === AgentStatus.AVAILABLE) {
         console.log(`[Toggle] Changing status from ${currentStatus} to UNAVAILABLE`);
        handleStatusChange(AgentStatus.UNAVAILABLE);
      } else {
         console.log(`[Toggle] No change needed. Already ${currentStatus} when toggled OFF.`);
      }
    }
    // Removed redundant console logs and simplified logic
  };

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
  const getStatusText = () => {
    switch (status) {
        case AgentStatus.AVAILABLE: return "Available";
        case AgentStatus.BUSY: return "Busy";
        case AgentStatus.WRAP_UP: return "Wrap Up";
        case AgentStatus.UNAVAILABLE: return "Unavailable";
        default: return "Unknown";
      }
  }

  // --- Log state before rendering ---
  console.log("[HUD Render] Status:", status, "Active Call:", activeCall ? activeCall.sid : 'null', "Incoming Call:", incomingCall ? incomingCall.sid : 'null');

  return (
    <TooltipProvider>
      <div
        ref={hudRef}
        className={cn(
          "fixed z-50 p-3 rounded-lg shadow-lg bg-card border flex flex-col items-center space-y-3 cursor-grab transition-all duration-100 ease-out",
          isDragging ? "cursor-grabbing scale-105 shadow-xl" : ""
        )}
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
        onMouseDown={handleDragStart}
      >
        {/* Status Indicator */}
        <div className="flex items-center space-x-2 w-full justify-center mb-2">
           <Tooltip>
            <TooltipTrigger asChild>
              <Circle className={cn("h-4 w-4 fill-current",
                  status === AgentStatus.AVAILABLE ? "text-green-500" :
                  status === AgentStatus.BUSY ? "text-red-500" :
                  status === AgentStatus.WRAP_UP ? "text-yellow-500" :
                  "text-gray-500"
              )} />
            </TooltipTrigger>
            <TooltipContent>
              <p>Status: {getStatusText()}</p>
            </TooltipContent>
          </Tooltip>
           <span className="text-sm font-medium">{getStatusText()}</span>
        </div>

        {/* Call Info Display */}
        {(activeCall || incomingCall) && (
          <div className="text-center mb-2 p-2 bg-muted rounded-md w-full">
            {incomingCall && !activeCall && (
              <>
                 <p className="text-sm font-semibold">{incomingCallInfo?.callerName ?? "Unknown Caller"}</p>
                <p className="text-xs text-muted-foreground">{incomingCallInfo?.callerNumber}</p>
                {incomingCallInfo?.isDirectLine === false && (
                  <p className="text-xs text-blue-500"> (Group: {incomingCallInfo?.groupName})</p>
                )}
              </>
            )}
            {activeCall && (
               <>
                 {/* Display caller info for inbound, target for outbound */}
                 <p className="text-sm font-semibold">{activeCall.callerName ? activeCall.callerName : (activeCall.targetNumber ? `Calling ${activeCall.targetNumber}` : "Connected")}</p>
                 <p className="text-xs text-muted-foreground">{activeCall.callerNumber ? activeCall.callerNumber : formatDuration(callDurationSeconds)}</p>
                 {/* Show duration only if not showing caller number */}
                 {!activeCall.callerNumber && <p className="text-xs text-muted-foreground">{formatDuration(callDurationSeconds)}</p>}
               </>
            )}
          </div>
        )}

        {/* Action Buttons Row */}
        <div className="flex space-x-2 items-center">

          {/* Incoming Call: Answer / Reject */}
          {incomingCall && !activeCall && (
            <>
               <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full w-12 h-12 bg-green-100 hover:bg-green-200"
                    onClick={handleAnswerCall}
                  >
                    <Phone className="h-6 w-6 text-green-600" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Answer Call</TooltipContent>
              </Tooltip>
               <Tooltip>
                 <TooltipTrigger asChild>
                   <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full w-12 h-12 bg-red-100 hover:bg-red-200"
                    onClick={handleRejectCall}
                    >
                     <PhoneOff className="h-6 w-6 text-red-600" />
                   </Button>
                 </TooltipTrigger>
                 <TooltipContent>Reject Call</TooltipContent>
               </Tooltip>
            </>
          )}

          {/* Active Call: Hangup / Mute / Keypad? */}
          {activeCall && (
            <>
              <Tooltip>
                 <TooltipTrigger asChild>
                    {/* Example Mute Button - Functionality TBD */}
                    <Button variant="ghost" size="icon" className="rounded-full w-12 h-12 hover:bg-gray-200">
                        <Mic className="h-6 w-6 text-gray-700" />
                    </Button>
                 </TooltipTrigger>
                 <TooltipContent>Mute</TooltipContent>
               </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* Example Keypad Button - Functionality TBD */}
                  <Button variant="ghost" size="icon" className="rounded-full w-12 h-12 hover:bg-gray-200">
                    <Grid className="h-6 w-6 text-gray-700" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Keypad</TooltipContent>
              </Tooltip>
               <Tooltip>
                 <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full w-12 h-12 bg-red-100 hover:bg-red-200"
                    onClick={() => {
                      console.log('[HUD onClick Hangup] Current activeCall state:', activeCall ? activeCall.sid : 'null');
                      handleEndCall();
                    }}
                  >
                    <PhoneOff className="h-6 w-6 text-red-600" />
                  </Button>
                 </TooltipTrigger>
                 <TooltipContent>Hang Up</TooltipContent>
               </Tooltip>
             </>
          )}

          {/* Idle State: Status Toggle / Dialpad */}
           {!incomingCall && !activeCall && (
             <>
               {/* Liquid Toggle for Status */}
               <LiquidToggle
                 checked={status === AgentStatus.AVAILABLE}
                 onCheckedChange={handleLiquidToggleChange}
                 disabled={status === AgentStatus.BUSY}
                 variant={status === AgentStatus.AVAILABLE ? 'success' : 'default'}
               />
 
               {/* Dialpad Button */}
               <Tooltip>
                 <TooltipTrigger asChild>
                   <Button
                     variant="ghost"
                     size="icon"
                     className={cn(
                       "rounded-full w-12 h-12",
                       status === AgentStatus.AVAILABLE ? "hover:bg-green-100" : "hover:bg-gray-200"
                     )}
                     onClick={() => setShowCallDialog(true)}
                     disabled={status === AgentStatus.UNAVAILABLE || status === AgentStatus.BUSY}
                   >
                     <PhoneOutgoing className={cn("h-6 w-6",
                       (status === AgentStatus.UNAVAILABLE || status === AgentStatus.BUSY) ? "text-red-500" :
                       status === AgentStatus.AVAILABLE ? "text-green-600" : "text-gray-700"
                     )} />
                   </Button>
                 </TooltipTrigger>
                <TooltipContent>Make a Call</TooltipContent>
               </Tooltip>
             </>
           )}
        </div>

        {/* Direct Dial Dialog */}
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
                <Button 
                  onClick={handleMakeCall}
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
    </TooltipProvider>
  );
} 