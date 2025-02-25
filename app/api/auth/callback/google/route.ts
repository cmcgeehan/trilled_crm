import { createGmailOAuth2Client } from '@/lib/oauth2/config'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    
    if (!code) {
      throw new Error('No authorization code provided')
    }

    // Get OAuth2 client
    const oauth2Client = createGmailOAuth2Client()
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code)
    
    // Get user info to get email
    oauth2Client.setCredentials(tokens)
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      }
    )
    
    if (!userInfoResponse.ok) {
      throw new Error('Failed to get user info')
    }
    
    const userInfo = await userInfoResponse.json()
    
    // Get Supabase client
    const supabase = createRouteHandlerClient({ cookies })
    
    // Get current user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session) {
      throw new Error('Not authenticated')
    }

    // Store integration in database
    const { error: integrationError } = await supabase
      .from('email_integrations')
      .upsert({
        user_id: session.user.id,
        provider: 'gmail',
        refresh_token: tokens.refresh_token!,
        access_token: tokens.access_token,
        token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        email: userInfo.email
      }, {
        onConflict: 'user_id,provider,email'
      })

    if (integrationError) {
      throw integrationError
    }

    // Redirect back to integrations page
    return NextResponse.redirect(new URL('/settings/integrations', process.env.NEXT_PUBLIC_APP_URL))
  } catch (error) {
    console.error('Gmail OAuth callback error:', error)
    return NextResponse.redirect(
      new URL(`/settings/integrations?error=${encodeURIComponent('Failed to connect Gmail')}`, 
      process.env.NEXT_PUBLIC_APP_URL)
    )
  }
} 