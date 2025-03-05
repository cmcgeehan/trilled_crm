import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/oauth2/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Get Supabase client
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    
    // Get current user from auth header
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      console.error('Auth error:', authError)
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 })
    }

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
      throw new Error(`Missing required fields: ${!to ? 'to' : ''} ${!subject ? 'subject' : ''} ${!content ? 'content' : ''}`.trim())
    }

    // Get the user's email integration
    const { data: integrations, error: integrationError } = await supabase
      .from('email_integrations')
      .select('*')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (integrationError) {
      console.error('Integration query error:', integrationError)
      throw new Error(`Failed to fetch email integration: ${integrationError.message}`)
    }

    if (!integrations || integrations.length === 0) {
      throw new Error('No email integration found - please connect your email account first')
    }

    // Use the most recently created integration
    const integration = integrations[0]

    console.log('Found email integration:', {
      provider: integration.provider,
      email: integration.email,
      hasAccessToken: !!integration.access_token,
      tokenExpiresAt: integration.token_expires_at
    })

    try {
      // Send the email
      const result = await sendEmail(
        integration,
        to,
        subject,
        content
      )

      console.log('Email sent successfully:', result)

      return NextResponse.json({ success: true, result })
    } catch (emailError) {
      console.error('Error sending email:', emailError)
      const errorMessage = emailError instanceof Error 
        ? emailError.message 
        : 'Failed to send email through provider'
      
      // Check for specific error types
      if (emailError instanceof Error) {
        if (emailError.message.includes('invalid_grant')) {
          return NextResponse.json(
            { error: 'Email integration needs to be reconnected. Please go to Settings to reconnect your email account.' },
            { status: 401 }
          )
        }
        if (emailError.message.includes('invalid_token')) {
          return NextResponse.json(
            { error: 'Email integration token has expired. Please go to Settings to reconnect your email account.' },
            { status: 401 }
          )
        }
        if (emailError.message.includes('token refresh')) {
          return NextResponse.json(
            { error: 'Failed to refresh email token. Please reconnect your email account in Settings.' },
            { status: 401 }
          )
        }
      }

      // Return a detailed error response for other errors
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error in email sending endpoint:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })

    // Return a more detailed error response
    const errorMessage = error instanceof Error ? error.message : 'Failed to send email'
    const errorDetails = error instanceof Error ? error.stack : undefined
    const status = errorMessage.includes('needs to be reconnected') || errorMessage.includes('token has expired')
      ? 401
      : 500

    return NextResponse.json(
      { 
        error: errorMessage,
        details: errorDetails
      },
      { status }
    )
  }
} 