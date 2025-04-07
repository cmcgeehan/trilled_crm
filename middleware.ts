import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { Database } from '@/types/supabase'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Add CORS headers for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', '*')
    response.headers.set('Access-Control-Max-Age', '86400')
  }

  // Allow Twilio webhook endpoints to bypass authentication
  if (request.nextUrl.pathname.startsWith('/api/twiml/') || 
      request.nextUrl.pathname.startsWith('/api/twilio/')) {
    return response
  }

  // Create supabase server client
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Refresh session if it exists
  const { data: { session }, error } = await supabase.auth.getSession()
  
  if (error) {
    console.error('Middleware - Session error:', error)
  }

  // Debug logging
  console.log('Middleware - Session:', session ? `exists (${session.user.email})` : 'none')

  // If user is not signed in and the current path is not /login,
  // redirect the user to /login
  if (!session && !request.nextUrl.pathname.startsWith('/login')) {
    console.log('Middleware - No session, redirecting to login')
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set('redirectedFrom', request.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // If user is signed in and trying to access /login, redirect to home
  if (session && request.nextUrl.pathname.startsWith('/login')) {
    console.log('Middleware - User is signed in, redirecting to home')
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
}

export function corsMiddleware(request: NextRequest) {
  // Get the response
  const response = NextResponse.next()

  // Add CORS headers
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', '*')
  response.headers.set('Access-Control-Max-Age', '86400')

  return response
}

// Configure the middleware to run on API routes
export const corsConfig = {
  matcher: '/api/:path*',
} 