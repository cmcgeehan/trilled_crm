import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Helper function to calculate follow-up dates
export const calculateFollowUpDates = (createdDate: Date, role: 'lead' | 'customer') => {
  const dates = []
  const day = 24 * 60 * 60 * 1000 // milliseconds in a day

  // Different intervals based on role
  const intervals = role === 'lead' 
    ? [1, 2, 4, 7, 10, 14, 28] // Lead follow-up sequence
    : [7] // Customer weekly sequence (just one interval that will be used repeatedly)

  // For leads, create the fixed sequence
  if (role === 'lead') {
    for (const interval of intervals) {
      dates.push(new Date(createdDate.getTime() + interval * day))
    }
  } else {
    // For customers, create 4 weekly follow-ups (the cron job will create more as needed)
    for (let i = 1; i <= 4; i++) {
      dates.push(new Date(createdDate.getTime() + (7 * i) * day))
    }
  }
  
  return dates
}

// Get the expected sequence based on role
export const getExpectedSequence = (role: 'lead' | 'customer') => {
  return role === 'lead'
    ? [1, 2, 4, 7, 10, 14, 28]
    : [7, 14, 21, 28] // Show next 4 weeks for customers
}

export const formatCompanyType = (type: string) => {
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export enum AgentStatus {
  UNAVAILABLE = 'unavailable',
  AVAILABLE = 'available',
  BUSY = 'busy',
  WRAP_UP = 'wrap-up',
  AWAY = 'away',
  OFFLINE = 'offline',
}
