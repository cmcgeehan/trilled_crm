import { OUTLOOK_CONFIG } from '@/lib/oauth2/config'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import * as msal from '@azure/msal-node'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Define proper types for MSAL logger
type LogLevel = 0 | 1 | 2 | 3 | 4
type LogMessage = string | Error

export async function GET(request: NextRequest) {
  try {
    // Log all environment variables we care about (excluding secrets)
    console.log('Environment check:', {
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      hasClientId: !!process.env.MICROSOFT_CLIENT_ID,
      hasClientSecret: !!process.env.MICROSOFT_CLIENT_SECRET,
      hasRedirectUri: !!process.env.MICROSOFT_REDIRECT_URI
    })

    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const adminConsent = searchParams.get('admin_consent')?.toLowerCase()
    const tenant = searchParams.get('tenant')
    const state = searchParams.get('state')
    
    console.log('Received callback with params:', {
      adminConsent,
      tenant,
      state,
      code: code ? 'present' : 'absent',
      url: request.url
    })
    
    // If this is an admin consent callback
    if (adminConsent === 'true' || state === 'admin_consent') {
      console.log('Processing admin consent callback')
      
      if (!process.env.NEXT_PUBLIC_APP_URL) {
        throw new Error('NEXT_PUBLIC_APP_URL environment variable is not set')
      }

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
      const redirectUrl = new URL(`${baseUrl}/settings/integrations?success=admin_consent`)
      
      console.log('Redirecting to:', redirectUrl.toString())
      
      // Use 302 Found for redirects after POST/PUT
      return NextResponse.redirect(redirectUrl, 302)
    }
    
    if (!code) {
      throw new Error('No authorization code provided')
    }

    // Initialize MSAL client
    const msalConfig = {
      auth: {
        clientId: OUTLOOK_CONFIG.clientId,
        clientSecret: OUTLOOK_CONFIG.clientSecret,
        authority: `https://login.microsoftonline.com/${tenant || 'organizations'}`,
      },
      system: {
        loggerOptions: {
          loggerCallback: (level: LogLevel, message: LogMessage) => {
            console.log(`MSAL (${level}):`, message);
          },
          piiLoggingEnabled: true,
          logLevel: 3 // Info
        }
      }
    }

    console.log('Initializing MSAL with config:', {
      clientId: OUTLOOK_CONFIG.clientId,
      authority: msalConfig.auth.authority,
      tenant: tenant || 'organizations'
    })

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
    const { error: integrationError } = await supabase
      .from('email_integrations')
      .upsert({
        user_id: session.user.id,
        provider: 'outlook',
        refresh_token: '', // MSAL handles token refresh internally
        access_token: tokenResponse.accessToken,
        token_expires_at: tokenResponse.expiresOn?.toISOString() || null,
        email: userInfo.mail || userInfo.userPrincipalName
      }, {
        onConflict: 'user_id,provider,email'
      })

    if (integrationError) {
      throw integrationError
    }

    // Redirect back to integrations page with success
    const successUrl = new URL('/settings/integrations?success=connected', process.env.NEXT_PUBLIC_APP_URL)
    return NextResponse.redirect(successUrl, 302)
  } catch (error) {
    console.error('Outlook OAuth callback error:', error)
    
    // Log additional context
    console.error('Error context:', {
      url: request.url,
      headers: Object.fromEntries(request.headers.entries()),
      env: {
        hasAppUrl: !!process.env.NEXT_PUBLIC_APP_URL,
        hasClientId: !!process.env.MICROSOFT_CLIENT_ID,
        hasClientSecret: !!process.env.MICROSOFT_CLIENT_SECRET,
        hasRedirectUri: !!process.env.MICROSOFT_REDIRECT_URI
      }
    })
    
    // Return a more graceful error page with debugging info
    return new NextResponse(
      `<html><body>
        <h1>Error connecting to Outlook</h1>
        <p>Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}</p>
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