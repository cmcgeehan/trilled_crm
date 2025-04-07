"use client";

import { useState, useEffect } from "react"
import { Phone } from "lucide-react"
import { supabase } from "@/lib/supabase"

export function PhoneHUD() {
  const [isAvailable, setIsAvailable] = useState(false)
  const [isCalling, setIsCalling] = useState(false)

  useEffect(() => {
    const checkAvailability = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        setIsAvailable(!!session)
      } catch (error) {
        console.error('Error checking availability:', error)
        setIsAvailable(false)
      }
    }

    checkAvailability()
  }, [])

  return (
    <div className="fixed bottom-4 right-4">
      <button
        className={`p-4 rounded-full ${
          isAvailable ? "bg-green-500" : isCalling ? "bg-red-500" : "bg-gray-500"
        } text-white shadow-lg`}
        onClick={() => setIsCalling(!isCalling)}
      >
        <Phone className="h-6 w-6" />
      </button>
    </div>
  )
} 