import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const type = requestUrl.searchParams.get('type')
  const redirectTo = requestUrl.searchParams.get('redirectTo') || '/'

  if (code) {
    const supabase = createRouteHandlerClient({ cookies })
    await supabase.auth.exchangeCodeForSession(code)

    // If this is a signup verification, redirect to set-password
    if (type === 'signup') {
      return NextResponse.redirect(new URL('/set-password', requestUrl.origin))
    }
  }

  // For all other cases, use the provided redirectTo or default to home
  return NextResponse.redirect(new URL(redirectTo, requestUrl.origin))
} 