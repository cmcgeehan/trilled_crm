import { Button } from "@/components/ui/button";
import { Phone } from "lucide-react";
import { ButtonProps } from "@/components/ui/button";

interface CallButtonProps extends ButtonProps {
  phoneNumber: string;
}

export function CallButton({ phoneNumber, ...props }: CallButtonProps) {
  const handleCall = () => {
    window.location.href = `tel:${phoneNumber}`;
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleCall}
      {...props}
    >
      <Phone className="h-4 w-4" />
    </Button>
  );
} 