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
      // Check URL hash for access token
      if (typeof window !== 'undefined' && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const type = hashParams.get('type')

        console.log('Hash params:', { accessToken: !!accessToken, type })

        if (accessToken && type === 'invite') {
          console.log('Found access token in hash, redirecting to verify')
          // If we're on the login page, remove the redirectTo param
          const verifyUrl = new URL('/auth/verify', window.location.href)
          verifyUrl.searchParams.set('token', accessToken)
          verifyUrl.searchParams.set('type', type)
          router.push(verifyUrl.pathname + verifyUrl.search)
          return
        }
      }

      // Check query parameters for token
      const token = searchParams?.get('token') || ''
      const type = searchParams?.get('type') || ''

      console.log('Query params:', { token: !!token, type })

      if (token && type === 'invite') {
        console.log('Found token in query params, redirecting to verify')
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
      router.replace('/')
    }

    handleInitialLoad()
  }, [router, searchParams, supabase.auth])

  return (
    <div className="container flex items-center justify-center min-h-screen py-12">
      <p>Loading...</p>
    </div>
  )
} 