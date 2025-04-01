import { OUTLOOK_CONFIG } from '@/lib/oauth2/config'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Add CORS headers helper
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function GET(request: NextRequest) {
  try {
    console.log('Microsoft OAuth callback started')
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')
    const state = searchParams.get('state')
    const sessionState = searchParams.get('session_state')
    const adminConsent = searchParams.get('admin_consent')
    
    // Log all parameters for debugging
    console.log('\n=== Microsoft OAuth Callback Details ===')
    console.log('Timestamp:', new Date().toISOString())
    console.log('Full URL:', request.url)
    console.log('\nCallback Parameters:')
    console.log('- Code:', code ? '✓ Present' : '✗ Missing')
    console.log('- Error:', error || 'None')
    console.log('- Error Description:', errorDescription || 'None')
    console.log('- State:', state || 'None')
    console.log('- Session State:', sessionState || 'None')
    console.log('- Admin Consent:', adminConsent || 'None')
    console.log('\nAll Search Params:', Object.fromEntries(searchParams.entries()))
    console.log('\nRequest Headers:', Object.fromEntries(request.headers.entries()))
    console.log('=======================================\n')
    
    // If Microsoft returned an error in the callback
    if (error || errorDescription) {
      console.error('\n🚨 Microsoft OAuth Error 🚨')
      console.error('----------------------------')
      console.error('Error Type:', error)
      console.error('Description:', errorDescription)
      console.error('State:', state)
      console.error('Session State:', sessionState)
      console.error('Admin Consent:', adminConsent)
      console.error('Timestamp:', new Date().toISOString())
      console.error('URL:', request.url)
      console.error('----------------------------\n')

      // Check for specific error types
      if (error === 'access_denied') {
        if (errorDescription?.includes('AADSTS50105')) {
          throw new Error('User is not assigned to a role for this application. Please contact your Microsoft 365 admin to grant access.')
        }
        if (errorDescription?.includes('AADSTS65005')) {
          throw new Error('Application does not have sufficient permissions. Please contact your Microsoft 365 admin to grant permissions.')
        }
        if (errorDescription?.toLowerCase().includes('blocked')) {
          throw new Error('Access was blocked by your Microsoft 365 organization settings. Please contact your admin to:\n1. Enable user consent for applications\n2. Add this application to allowed applications\n3. Check conditional access policies')
        }
        throw new Error(`Access denied by Microsoft: ${errorDescription}`)
      }

      if (error === 'invalid_client') {
        throw new Error('Application configuration error. Please verify the application registration in Azure Portal.')
      }

      if (error === 'unauthorized_client') {
        throw new Error('This application is not authorized for your organization. Please contact your Microsoft 365 admin to approve the application.')
      }

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

    console.log('\n=== Token Request Details ===')
    console.log('Endpoint:', tokenEndpoint)
    console.log('Client ID:', OUTLOOK_CONFIG.clientId)
    console.log('Has Client Secret:', !!OUTLOOK_CONFIG.clientSecret)
    console.log('Redirect URI:', OUTLOOK_CONFIG.redirectUri)
    console.log('Requested Scopes:', OUTLOOK_CONFIG.scopes)
    console.log('===========================\n')

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenRequestBody
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('\n❌ Token Exchange Failed ❌')
      console.error('---------------------------')
      console.error('Status:', tokenResponse.status)
      console.error('Status Text:', tokenResponse.statusText)
      console.error('Error:', errorText)
      console.error('Response Headers:', Object.fromEntries(tokenResponse.headers.entries()))
      console.error('---------------------------\n')
      throw new Error(`Failed to exchange code for tokens: ${errorText}`)
    }

    const tokens = await tokenResponse.json()
    console.log('Token exchange successful:', {
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
    
    // Get current user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    console.log('Supabase session check:', {
      hasSession: !!session,
      sessionError: sessionError?.message,
      userId: session?.user?.id
    })
    
    if (sessionError || !session) {
      console.error('Authentication error:', {
        error: sessionError,
        hasSession: !!session
      })
      throw new Error('Not authenticated - please log in again')
    }

    // Store integration in database
    console.log('Storing email integration for user:', {
      userId: session.user.id,
      email: userInfo.mail || userInfo.userPrincipalName
    })

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
    return NextResponse.redirect(successUrl, { 
      status: 302,
      headers: {
        ...corsHeaders,
        'Cache-Control': 'no-store'
      }
    })
  } catch (error) {
    console.error('Outlook OAuth callback error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    
    // Return error response with CORS headers
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
    return NextResponse.json(
      { error: errorMessage },
      { 
        status: 500,
        headers: {
          ...corsHeaders,
          'Cache-Control': 'no-store'
        }
      }
    )
  }
} 