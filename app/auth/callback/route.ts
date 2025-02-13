import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')
  const token = requestUrl.searchParams.get('token')
  const redirectTo = requestUrl.searchParams.get('redirectTo')

  // Get the origin from redirectTo if it exists, otherwise use request origin
  const targetOrigin = redirectTo ? new URL(redirectTo).origin : requestUrl.origin

  console.log('Callback received:', {
    code,
    type,
    token,
    redirectTo,
    fullUrl: request.url,
    targetOrigin
  })

  if (code) {
    const supabase = createRouteHandlerClient({ cookies })
    await supabase.auth.exchangeCodeForSession(code)

    // If this is a signup verification, redirect to set-password
    if (type === 'signup') {
      return NextResponse.redirect(new URL('/set-password', targetOrigin))
    }
    
    // If this is an invite verification, redirect to verify page with parameters
    if (type === 'invite') {
      const verifyUrl = new URL('/auth/verify', targetOrigin)
      // Preserve all relevant parameters
      if (token) verifyUrl.searchParams.set('token', token)
      verifyUrl.searchParams.set('type', 'invite')
      if (code) verifyUrl.searchParams.set('code', code)
      
      console.log('Redirecting to verify with params:', {
        url: verifyUrl.toString(),
        params: Object.fromEntries(verifyUrl.searchParams)
      })
      
      return NextResponse.redirect(verifyUrl)
    }
  }

  // For all other cases, use the provided redirectTo or default to home at the target origin
  return NextResponse.redirect(new URL(redirectTo || '/', targetOrigin))
} 