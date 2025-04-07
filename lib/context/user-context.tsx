"use client"

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/auth-helpers-nextjs'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Database } from '@/types/supabase'

interface UserContextType {
  user: User | null
  userEmail: string | null
  isLoading: boolean
}

const UserContext = createContext<UserContextType>({
  user: null,
  userEmail: null,
  isLoading: true,
})

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  // Create the browser client
  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // First check for existing session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          console.error('Session error:', sessionError)
          throw sessionError
        }

        if (session) {
          console.log('User context - Found session:', session.user.email)
          setUser(session.user)
          setUserEmail(session.user.email || null)
        } else {
          console.log('User context - No session found')
          setUser(null)
          setUserEmail(null)
        }
      } catch (error) {
        console.error('Error initializing auth:', error)
        setUser(null)
        setUserEmail(null)
      } finally {
        setIsLoading(false)
      }
    }

    initializeAuth()

    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('User context - Auth state changed:', event, session?.user?.email)
      
      if (event === 'SIGNED_IN') {
        setUser(session?.user ?? null)
        setUserEmail(session?.user?.email ?? null)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setUserEmail(null)
        router.push('/login')
      } else if (event === 'TOKEN_REFRESHED') {
        setUser(session?.user ?? null)
        setUserEmail(session?.user?.email ?? null)
      }
      
      setIsLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router, supabase])

  return (
    <UserContext.Provider value={{ user, userEmail, isLoading }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
} 