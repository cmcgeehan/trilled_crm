import { OUTLOOK_CONFIG } from '@/lib/oauth2/config'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')
    
    // If Microsoft returned an error in the callback
    if (error || errorDescription) {
      throw new Error(`Microsoft OAuth Error: ${error} - ${errorDescription}`)
    }
    
    if (!code) {
      throw new Error('No authorization code provided')
    }

    console.log('Received authorization code, attempting token exchange...')

    // Exchange the authorization code for tokens
    const tokenEndpoint = `${OUTLOOK_CONFIG.authority}/oauth2/v2.0/token`
    const tokenRequestBody = new URLSearchParams({
      client_id: OUTLOOK_CONFIG.clientId,
      client_secret: OUTLOOK_CONFIG.clientSecret,
      code: code,
      redirect_uri: OUTLOOK_CONFIG.redirectUri,
      grant_type: 'authorization_code',
      scope: OUTLOOK_CONFIG.scopes.join(' ')
    })

    console.log('Token request parameters:', {
      endpoint: tokenEndpoint,
      client_id: OUTLOOK_CONFIG.clientId,
      hasClientSecret: !!OUTLOOK_CONFIG.clientSecret,
      redirect_uri: OUTLOOK_CONFIG.redirectUri,
      scopes: OUTLOOK_CONFIG.scopes
    })

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenRequestBody
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText
      })
      throw new Error(`Failed to exchange code for tokens: ${errorText}`)
    }

    const tokens = await tokenResponse.json()
    console.log('Token exchange response:', {
      hasAccessToken: !!tokens.access_token,
      accessTokenLength: tokens.access_token?.length,
      hasRefreshToken: !!tokens.refresh_token,
      refreshTokenLength: tokens.refresh_token?.length,
      tokenType: tokens.token_type,
      scope: tokens.scope,
      expiresIn: tokens.expires_in
    })

    if (!tokens.refresh_token) {
      console.error('No refresh token in response:', {
        responseKeys: Object.keys(tokens),
        scope: tokens.scope
      })
      throw new Error('No refresh token received from Microsoft')
    }

    // Get user info from Microsoft Graph
    console.log('Getting user info from Graph API...')
    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    })

    if (!graphResponse.ok) {
      const errorText = await graphResponse.text()
      throw new Error(`Failed to get user info: ${errorText}`)
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
    // First try to find an existing integration
    const { data: existingIntegration } = await supabase
      .from('email_integrations')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('provider', 'outlook')
      .eq('email', userInfo.mail || userInfo.userPrincipalName)
      .is('deleted_at', null)
      .single()

    if (existingIntegration) {
      // Update existing integration
      const { error: updateError } = await supabase
        .from('email_integrations')
        .update({
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token,
          token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingIntegration.id)

      if (updateError) {
        console.error('Integration update error:', updateError)
        throw updateError
      }
    } else {
      // Insert new integration
      const { error: insertError } = await supabase
        .from('email_integrations')
        .insert({
          user_id: session.user.id,
          provider: 'outlook',
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token,
          token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          email: userInfo.mail || userInfo.userPrincipalName,
          deleted_at: null
        })

      if (insertError) {
        console.error('Integration insert error:', insertError)
        throw insertError
      }
    }

    // Redirect back to integrations page with success
    const successUrl = new URL('/settings/integrations?success=connected', process.env.NEXT_PUBLIC_APP_URL)
    return NextResponse.redirect(successUrl, 302)
  } catch (error) {
    console.error('Outlook OAuth callback error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    
    // Return a more detailed error page
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    const errorDetails = error instanceof Error ? error.stack : JSON.stringify(error, null, 2)
    
    return new NextResponse(
      `<html><body>
        <h1>Error connecting to Outlook</h1>
        <p>Error: ${errorMessage}</p>
        <p>Details: ${errorDetails}</p>
        <p>Time: ${new Date().toISOString()}</p>
        <p>Please contact support with this information.</p>
        <p><a href="/settings/integrations">Return to Integrations</a></p>
      </body></html>`,
      {
        status: 500,
        headers: {
          'Content-Type': 'text/html',
        },
      }
    )
  }
} 