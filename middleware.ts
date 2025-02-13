import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  try {
    // Log the request details
    console.log('Middleware handling request:', {
      pathname: request.nextUrl.pathname,
      search: request.nextUrl.search,
      fullUrl: request.url
    })

    // Create a response to modify
    const res = NextResponse.next()
    
    // Create the Supabase client
    const supabase = createMiddlewareClient({ req: request, res })
    
    // Refresh session if expired
    const {
      data: { session },
    } = await supabase.auth.getSession()

    // Check if this is an auth-related request (has token or type=invite)
    const hasAuthParams = request.nextUrl.searchParams.has('token') || 
                         request.nextUrl.searchParams.get('type') === 'invite'

    // Public routes that don't require authentication
    const publicRoutes = ['/login', '/auth/callback', '/auth/verify', '/auth/initial-verify']
    const isPublicRoute = publicRoutes.some(route => request.nextUrl.pathname.startsWith(route))

    console.log('Auth check:', {
      hasSession: !!session,
      isPublicRoute,
      hasAuthParams,
      pathname: request.nextUrl.pathname
    })

    // Allow the request if:
    // 1. It's a public route OR
    // 2. It has auth-related parameters OR
    // 3. User has a session
    if (isPublicRoute || hasAuthParams || session) {
      return res
    }

    // Otherwise redirect to login
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('redirectTo', request.nextUrl.pathname)
    console.log('Redirecting to login:', redirectUrl.toString())
    return NextResponse.redirect(redirectUrl)

  } catch (e) {
    // If there's an error, redirect to login
    console.error('Middleware error:', e)
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
} 