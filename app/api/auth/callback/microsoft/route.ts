import { OUTLOOK_CONFIG } from '@/lib/oauth2/config'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import * as msal from '@azure/msal-node'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Define proper types for MSAL logger and errors
type LogLevel = 0 | 1 | 2 | 3 | 4
type LogMessage = string | Error

interface MSALError extends Error {
  errorCode?: string;
  errorMessage?: string;
  subError?: string;
  correlationId?: string;
  response?: unknown;
}

export async function GET(request: NextRequest) {
  try {
    // Log all environment variables we care about (excluding secrets)
    console.log('Environment check:', {
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      hasClientId: !!process.env.MICROSOFT_CLIENT_ID,
      hasClientSecret: !!process.env.MICROSOFT_CLIENT_SECRET,
      hasRedirectUri: !!process.env.MICROSOFT_REDIRECT_URI,
      clientIdLength: process.env.MICROSOFT_CLIENT_ID?.length || 0,
      clientSecretLength: process.env.MICROSOFT_CLIENT_SECRET?.length || 0
    })

    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const adminConsent = searchParams.get('admin_consent')?.toLowerCase()
    const tenant = searchParams.get('tenant')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')
    
    // If Microsoft returned an error in the callback
    if (error || errorDescription) {
      throw new Error(`Microsoft OAuth Error: ${error} - ${errorDescription}`)
    }
    
    console.log('Received callback with params:', {
      adminConsent,
      tenant,
      state,
      code: code ? 'present' : 'absent',
      url: request.url,
      error,
      errorDescription
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
      
      return NextResponse.redirect(redirectUrl, 302)
    }
    
    if (!code) {
      throw new Error('No authorization code provided')
    }

    // Validate environment variables
    if (!process.env.MICROSOFT_CLIENT_ID) {
      throw new Error('MICROSOFT_CLIENT_ID environment variable is not set')
    }
    if (!process.env.MICROSOFT_CLIENT_SECRET) {
      throw new Error('MICROSOFT_CLIENT_SECRET environment variable is not set')
    }
    if (!process.env.MICROSOFT_REDIRECT_URI) {
      throw new Error('MICROSOFT_REDIRECT_URI environment variable is not set')
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

    // Log config details (safely)
    console.log('MSAL Configuration check:', {
      hasClientId: !!msalConfig.auth.clientId,
      clientIdLength: msalConfig.auth.clientId?.length || 0,
      hasClientSecret: !!msalConfig.auth.clientSecret,
      clientSecretLength: msalConfig.auth.clientSecret?.length || 0,
      authority: msalConfig.auth.authority,
      scopes: OUTLOOK_CONFIG.scopes,
      redirectUri: OUTLOOK_CONFIG.redirectUri
    })

    // Validate MSAL config
    if (!msalConfig.auth.clientId || !msalConfig.auth.clientSecret) {
      throw new Error('Invalid MSAL configuration: Missing client credentials')
    }

    if (msalConfig.auth.clientSecret.length < 30) {
      throw new Error('Invalid client secret: Length is too short')
    }

    console.log('Initializing MSAL with config:', {
      clientId: OUTLOOK_CONFIG.clientId,
      authority: msalConfig.auth.authority,
      tenant: tenant || 'organizations',
      scopes: OUTLOOK_CONFIG.scopes,
      redirectUri: OUTLOOK_CONFIG.redirectUri
    })

    const cca = new msal.ConfidentialClientApplication(msalConfig)
    
    // Exchange code for tokens
    console.log('Attempting to exchange code for tokens...')
    try {
      const tokenResponse = await cca.acquireTokenByCode({
        code,
        scopes: OUTLOOK_CONFIG.scopes,
        redirectUri: OUTLOOK_CONFIG.redirectUri
      })

      if (!tokenResponse) {
        throw new Error('Failed to get tokens - no response')
      }

      console.log('Token exchange successful')
      
      // Get user info
      console.log('Getting user info from Graph API...')
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
          email: userInfo.mail || userInfo.userPrincipalName,
          deleted_at: null // Ensure we match the unique constraint
        }, {
          onConflict: 'user_id,provider,email'
        })

      if (integrationError) {
        console.error('Integration error:', integrationError)
        throw integrationError
      }

      // Redirect back to integrations page with success
      const successUrl = new URL('/settings/integrations?success=connected', process.env.NEXT_PUBLIC_APP_URL)
      return NextResponse.redirect(successUrl, 302)
    } catch (error) {
      const msalError = error as MSALError
      console.error('Token exchange error:', {
        name: msalError.name,
        errorCode: msalError.errorCode,
        errorMessage: msalError.errorMessage,
        subError: msalError.subError,
        correlationId: msalError.correlationId,
        stack: msalError.stack,
        response: msalError.response
      })
      throw msalError
    }
  } catch (error) {
    const msalError = error as MSALError
    console.error('Outlook OAuth callback error:', {
      error,
      message: msalError.message || 'Unknown error',
      name: msalError.name || 'Unknown',
      stack: msalError.stack || 'No stack trace',
      code: msalError.errorCode,
      subError: msalError.subError,
      correlationId: msalError.correlationId
    })
    
    // Log additional context
    console.error('Error context:', {
      url: request.url,
      headers: Object.fromEntries(request.headers.entries()),
      env: {
        hasAppUrl: !!process.env.NEXT_PUBLIC_APP_URL,
        hasClientId: !!process.env.MICROSOFT_CLIENT_ID,
        hasClientSecret: !!process.env.MICROSOFT_CLIENT_SECRET,
        hasRedirectUri: !!process.env.MICROSOFT_REDIRECT_URI,
        clientIdLength: process.env.MICROSOFT_CLIENT_ID?.length || 0,
        clientSecretLength: process.env.MICROSOFT_CLIENT_SECRET?.length || 0
      }
    })
    
    // Return a more detailed error page
    const errorMessage = msalError.message || 'An unknown error occurred'
    const errorDetails = msalError.stack || JSON.stringify(error, null, 2)
    const errorCode = msalError.errorCode || 'No error code'
    const errorCorrelationId = msalError.correlationId || 'No correlation ID'
    
    return new NextResponse(
      `<html><body>
        <h1>Error connecting to Outlook</h1>
        <p>Error: ${errorMessage}</p>
        <p>Error Code: ${errorCode}</p>
        <p>Correlation ID: ${errorCorrelationId}</p>
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