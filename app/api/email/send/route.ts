import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/oauth2/email'
import type { GraphError } from '@/lib/oauth2/types'
import type { CookieOptions } from '@supabase/ssr'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Add OPTIONS handler for CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  })
}

export async function POST(request: NextRequest) {
  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }

  try {
    console.log('Starting email send request...')
    
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options })
          },
        },
      }
    )
    
    // Get current user from auth header
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('Missing or invalid authorization header:', { authHeader })
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' }, 
        { status: 401, headers }
      )
    }

    const token = authHeader.split(' ')[1]
    console.log('Authenticating user with token...')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      console.error('Auth error:', { authError, hasUser: !!user })
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401, headers })
    }

    console.log('User authenticated:', { userId: user.id })

    // Parse request body
    const body = await request.json()
    const { to, subject, content } = body

    console.log('Received email request:', {
      to,
      subject,
      contentLength: content?.length,
      userId: user.id
    })

    if (!to || !subject || !content) {
      const missingFields = {
        to: !to,
        subject: !subject,
        content: !content
      }
      console.error('Missing required fields:', missingFields)
      return NextResponse.json({ 
        error: `Missing required fields: ${Object.entries(missingFields)
          .filter(entry => entry[1])
          .map(entry => entry[0])
          .join(', ')}`
      }, { status: 400, headers })
    }

    // Get the user's email integration
    console.log('Fetching email integration...')
    const { data: integrations, error: integrationError } = await supabase
      .from('email_integrations')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (integrationError) {
      console.error('Integration query error:', integrationError)
      return NextResponse.json({ 
        error: `Failed to fetch email integration: ${integrationError.message}` 
      }, { status: 500, headers })
    }

    if (!integrations || integrations.length === 0) {
      console.error('No email integration found for user:', user.id)
      return NextResponse.json({ 
        error: 'No email integration found - please connect your email account first' 
      }, { status: 404, headers })
    }

    // Use the most recently created integration
    const integration = integrations[0]

    console.log('Found email integration:', {
      provider: integration.provider,
      email: integration.email,
      hasAccessToken: !!integration.access_token,
      hasRefreshToken: !!integration.refresh_token,
      tokenExpiresAt: integration.token_expires_at
    })

    try {
      // Send the email
      console.log('Attempting to send email...')
      const result = await sendEmail(
        integration,
        to,
        subject,
        content
      )

      console.log('Email sent successfully:', result)
      return NextResponse.json({ success: true, result }, { headers })
    } catch (emailError) {
      console.error('Error sending email:', {
        error: emailError,
        message: emailError instanceof Error ? emailError.message : 'Unknown error',
        stack: emailError instanceof Error ? emailError.stack : undefined
      })
      
      // Check for specific error types
      if (emailError instanceof Error) {
        if (emailError.message.includes('invalid_grant')) {
          return NextResponse.json(
            { error: 'Email integration needs to be reconnected. Please go to Settings to reconnect your email account.' },
            { status: 401, headers }
          )
        }
        if (emailError.message.includes('invalid_token') || (emailError as GraphError).statusCode === 401) {
          return NextResponse.json(
            { error: 'Email integration token has expired. Please go to Settings to reconnect your email account.' },
            { status: 401, headers }
          )
        }
        if (emailError.message.includes('token refresh')) {
          return NextResponse.json(
            { error: 'Failed to refresh email token. Please reconnect your email account in Settings.' },
            { status: 401, headers }
          )
        }
      }

      // Return a detailed error response for other errors
      return NextResponse.json(
        { 
          error: emailError instanceof Error 
            ? `Failed to send email: ${emailError.message}${emailError.cause ? ` (${JSON.stringify(emailError.cause)})` : ''}`
            : 'Failed to send email',
          details: emailError instanceof Error ? emailError.stack : undefined,
          cause: emailError instanceof Error ? emailError.cause : undefined
        },
        { status: 500, headers }
      )
    }
  } catch (error) {
    console.error('Unhandled error in email sending endpoint:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      cause: error instanceof Error ? error.cause : undefined
    })

    // Return a more detailed error response
    return NextResponse.json(
      { 
        error: error instanceof Error 
          ? `Failed to send email: ${error.message}${error.cause ? ` (${JSON.stringify(error.cause)})` : ''}`
          : 'Failed to send email',
        details: error instanceof Error ? error.stack : undefined,
        cause: error instanceof Error ? error.cause : undefined
      },
      { status: 500, headers }
    )
  }
} 