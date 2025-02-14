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
    : [14, 28, 42, 56, 70, 90, 120, 150, 180] // Customer follow-up sequence

  for (const interval of intervals) {
    dates.push(new Date(createdDate.getTime() + interval * day))
  }
  
  return dates
}

export const formatCompanyType = (type: string) => {
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
