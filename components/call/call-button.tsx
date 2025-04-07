import { Button } from "@/components/ui/button";
import { Phone } from "lucide-react";

interface CallButtonProps {
  phoneNumber: string;
  className?: string;
}

export function CallButton({ phoneNumber, className }: CallButtonProps) {
  const handleCall = () => {
    window.location.href = `tel:${phoneNumber}`;
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleCall}
      className={className}
    >
      <Phone className="h-4 w-4" />
    </Button>
  );
} 