import { createBrowserClient } from '@supabase/ssr'
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
export const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    cookies: {
      get(name) {
        return document.cookie
          .split('; ')
          .find((row) => row.startsWith(`${name}=`))
          ?.split('=')[1]
      },
      set(name, value, options) {
        document.cookie = `${name}=${value}; path=${options.path}; max-age=${options.maxAge}`
      },
      remove(name, options) {
        document.cookie = `${name}=; path=${options.path}; expires=Thu, 01 Jan 1970 00:00:00 GMT`
      },
    },
  }
)

// Export the URL for verification purposes
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL 