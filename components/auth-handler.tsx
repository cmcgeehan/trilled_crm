'use client'

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function AuthHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient()

  useEffect(() => {
    const handleInitialLoad = async () => {
      // Check if this is a Supabase verification redirect
      const token = searchParams.get('token')
      const type = searchParams.get('type')

      console.log('Auth handler params:', { token, type })

      if (token && type === 'invite') {
        // This is an invite verification, redirect to verify page
        console.log('Detected invite verification, redirecting to verify page')
        router.push(`/auth/verify?token=${token}&type=${type}`)
        return
      }

      // Check for session
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        console.log('No session found, redirecting to login')
        router.replace('/login')
        return
      }

      // If we have a session, redirect to dashboard
      router.replace('/dashboard')
    }

    handleInitialLoad()
  }, [router, searchParams, supabase.auth])

  return (
    <div className="container flex items-center justify-center min-h-screen py-12">
      <p>Loading...</p>
    </div>
  )
} 