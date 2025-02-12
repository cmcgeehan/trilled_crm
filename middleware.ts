import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  try {
    // Create a response to modify
    const res = NextResponse.next()
    
    // Create the Supabase client
    const supabase = createMiddlewareClient({ req: request, res })
    
    // Refresh session if expired
    const {
      data: { session },
    } = await supabase.auth.getSession()

    // Public routes that don't require authentication
    const publicRoutes = ['/login', '/auth/callback']
    const isPublicRoute = publicRoutes.some(route => request.nextUrl.pathname.startsWith(route))

    // If we're not on a public route and there's no session, redirect to login
    if (!isPublicRoute && !session) {
      const redirectUrl = new URL('/login', request.url)
      redirectUrl.searchParams.set('redirectTo', request.nextUrl.pathname)
      return NextResponse.redirect(redirectUrl)
    }

    // If we're on the login page and we're already logged in, redirect to home
    if (request.nextUrl.pathname === '/login' && session) {
      const redirectTo = request.nextUrl.searchParams.get('redirectTo')
      return NextResponse.redirect(new URL(redirectTo || '/', request.url))
    }

    // Return the response with the session cookie
    return res

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