import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PhoneIncoming, PhoneOutgoing } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface CallOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ActiveCall {
  sid: string;
  from: string;
  to: string;
  status: string;
  direction: "incoming" | "outgoing";
}

export function CallOverlay({ isOpen, onClose }: CallOverlayProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);

  const handleMakeCall = async () => {
    try {
      const response = await fetch('/api/calls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER,
          to: phoneNumber,
          url: `${process.env.NEXT_PUBLIC_APP_URL}/api/twiml/outbound`
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to initiate call');
      }

      const data = await response.json();
      console.log('Call initiated:', data.callSid);
      setPhoneNumber("");
    } catch (error) {
      console.error('Error making call:', error);
    }
  };

  const handleEndCall = async (callSid: string) => {
    try {
      const response = await fetch(`/api/calls/${callSid}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to end call');
      }

      setActiveCalls(activeCalls.filter(call => call.sid !== callSid));
    } catch (error) {
      console.error('Error ending call:', error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Phone Calls</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter phone number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
            <Button onClick={handleMakeCall}>
              <PhoneIncoming className="h-4 w-4 mr-2" />
              Call
            </Button>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Active Calls</h3>
            {activeCalls.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active calls</p>
            ) : (
              activeCalls.map((call) => (
                <div
                  key={call.sid}
                  className="flex items-center justify-between p-2 border rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    {call.direction === "incoming" ? (
                      <PhoneIncoming className="h-4 w-4 text-green-500" />
                    ) : (
                      <PhoneOutgoing className="h-4 w-4 text-blue-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {call.direction === "incoming" ? call.from : call.to}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {call.status}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEndCall(call.sid)}
                  >
                    <PhoneOutgoing className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 