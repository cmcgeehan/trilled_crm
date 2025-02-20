import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Database } from '@/types/supabase'

// Debug: Log the URL being used (but not the key for security)
console.log('Supabase URL being used:', process.env.NEXT_PUBLIC_SUPABASE_URL)

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL')
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

// Create a single supabase client for interacting with your database
export const supabase = createClientComponentClient<Database>({
  options: {
    realtime: {
      timeout: 60000, // 60 seconds
      params: {
        eventsPerSecond: 10
      }
    },
    global: {
      headers: {
        'x-my-custom-header': 'CRM application'
      }
    }
  }
})

// Export the URL for verification purposes
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL 