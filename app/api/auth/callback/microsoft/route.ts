import { OUTLOOK_CONFIG } from '@/lib/oauth2/config'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import * as msal from '@azure/msal-node'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    
    if (!code) {
      throw new Error('No authorization code provided')
    }

    // Initialize MSAL client
    const msalConfig = {
      auth: {
        clientId: OUTLOOK_CONFIG.clientId,
        clientSecret: OUTLOOK_CONFIG.clientSecret,
        authority: OUTLOOK_CONFIG.authority
      }
    }
    const cca = new msal.ConfidentialClientApplication(msalConfig)
    
    // Exchange code for tokens
    const tokenResponse = await cca.acquireTokenByCode({
      code,
      scopes: OUTLOOK_CONFIG.scopes,
      redirectUri: OUTLOOK_CONFIG.redirectUri
    })

    if (!tokenResponse) {
      throw new Error('Failed to get tokens')
    }

    // Get user info
    const graphResponse = await fetch(
      'https://graph.microsoft.com/v1.0/me',
      {
        headers: {
          Authorization: `Bearer ${tokenResponse.accessToken}`,
        },
      }
    )

    if (!graphResponse.ok) {
      throw new Error('Failed to get user info')
    }

    const userInfo = await graphResponse.json()

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
        provider: 'outlook',
        refresh_token: '', // We'll need to implement token refresh separately
        access_token: tokenResponse.accessToken,
        token_expires_at: tokenResponse.expiresOn?.toISOString() || null,
        email: userInfo.mail || userInfo.userPrincipalName
      }, {
        onConflict: 'user_id,provider,email'
      })

    if (integrationError) {
      throw integrationError
    }

    // Redirect back to integrations page
    return NextResponse.redirect(new URL('/settings/integrations', process.env.NEXT_PUBLIC_APP_URL))
  } catch (error) {
    console.error('Outlook OAuth callback error:', error)
    return NextResponse.redirect(
      new URL(`/settings/integrations?error=${encodeURIComponent('Failed to connect Outlook')}`, 
      process.env.NEXT_PUBLIC_APP_URL)
    )
  }
} 