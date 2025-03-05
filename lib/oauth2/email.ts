import { createGmailOAuth2Client } from './config'
import { google } from 'googleapis'
import { Database } from '@/types/supabase'
import { Client } from '@microsoft/microsoft-graph-client'
import { ConfidentialClientApplication } from '@azure/msal-node'
import { OUTLOOK_CONFIG } from './config'
import { createClient } from '@supabase/supabase-js'

type EmailIntegration = Database['public']['Tables']['email_integrations']['Row']

interface GraphError extends Error {
  statusCode?: number;
  code?: string;
  requestId?: string;
  body?: unknown;
}

export async function sendEmail(
  integration: EmailIntegration,
  to: string,
  subject: string,
  content: string
) {
  if (integration.provider === 'gmail') {
    return sendGmailEmail(integration, to, subject, content)
  } else if (integration.provider === 'outlook') {
    return sendOutlookEmail(integration, to, subject, content)
  }
  throw new Error(`Unsupported email provider: ${integration.provider}`)
}

async function sendGmailEmail(
  integration: EmailIntegration,
  to: string,
  subject: string,
  content: string
) {
  const oauth2Client = createGmailOAuth2Client()
  oauth2Client.setCredentials({
    access_token: integration.access_token,
    refresh_token: integration.refresh_token,
    expiry_date: integration.token_expires_at ? new Date(integration.token_expires_at).getTime() : undefined
  })

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  // Create the email message
  const message = [
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    `To: ${to}`,
    `From: ${integration.email}`,
    `Subject: ${subject}`,
    '',
    content
  ].join('\r\n')

  // Encode the message in base64URL format
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  try {
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    })

    return response.data
  } catch (error) {
    console.error('Error sending Gmail:', error)
    throw error
  }
}

async function sendOutlookEmail(
  integration: EmailIntegration,
  to: string,
  subject: string,
  content: string
) {
  // Create MSAL confidential client
  const msalConfig = {
    auth: {
      clientId: OUTLOOK_CONFIG.clientId,
      clientSecret: OUTLOOK_CONFIG.clientSecret,
      authority: 'https://login.microsoftonline.com/common'
    },
    system: {
      loggerOptions: {
        loggerCallback(logLevel: number, message: string) {
          console.log('MSAL:', message);
        },
        piiLoggingEnabled: false,
        logLevel: 3 // Info
      }
    }
  }
  
  const cca = new ConfidentialClientApplication(msalConfig)

  // Create an authentication provider that handles token refresh
  const authProvider = {
    getAccessToken: async () => {
      try {
        console.log('Getting access token for email integration:', {
          hasAccessToken: !!integration.access_token,
          hasRefreshToken: !!integration.refresh_token,
          tokenExpiresAt: integration.token_expires_at
        })

        // First try to use the existing access token if it's not expired
        if (integration.access_token && integration.token_expires_at) {
          const expiryDate = new Date(integration.token_expires_at)
          if (expiryDate > new Date()) {
            console.log('Using existing access token')
            return integration.access_token
          }
          console.log('Access token expired, attempting refresh')
        }

        // Token is expired, try to refresh it
        if (!integration.refresh_token) {
          console.error('No refresh token available')
          throw new Error('No refresh token available - please reconnect your email integration')
        }

        console.log('Attempting to refresh token with scopes:', OUTLOOK_CONFIG.scopes)

        const refreshRequest = {
          refreshToken: integration.refresh_token,
          scopes: OUTLOOK_CONFIG.scopes,
          authority: 'https://login.microsoftonline.com/common',
          clientId: OUTLOOK_CONFIG.clientId,
          clientSecret: OUTLOOK_CONFIG.clientSecret
        }

        const response = await cca.acquireTokenByRefreshToken(refreshRequest)
        if (!response) {
          console.error('Token refresh returned null response')
          throw new Error('Failed to refresh token - please reconnect your email integration')
        }

        console.log('Token refresh successful:', {
          hasAccessToken: !!response.accessToken,
          expiresOn: response.expiresOn,
          scopes: response.scopes
        })

        // Update the integration with new tokens
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        
        await supabase
          .from('email_integrations')
          .update({
            access_token: response.accessToken,
            token_expires_at: response.expiresOn?.toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', integration.id)

        return response.accessToken
        
      } catch (error) {
        console.error('Error getting access token:', {
          error,
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        })
        throw new Error('Email integration needs to be reconnected - token refresh failed')
      }
    }
  }

  // Initialize the Graph client with our custom auth provider
  const graphClient = Client.init({
    authProvider: async (done) => {
      try {
        const token = await authProvider.getAccessToken()
        done(null, token)
      } catch (error) {
        console.error('Graph client auth error:', error)
        done(error as Error, null)
      }
    }
  })

  try {
    console.log('Attempting to send email:', {
      to,
      hasSubject: !!subject,
      contentLength: content?.length,
      userEmail: integration.email
    })

    // Send mail using Microsoft Graph API with delegated permissions
    await graphClient
      .api('/me/sendMail')
      .post({
        message: {
          subject,
          body: {
            contentType: 'HTML',
            content
          },
          toRecipients: [
            {
              emailAddress: {
                address: to
              }
            }
          ]
        },
        saveToSentItems: true
      })

    console.log('Email sent successfully')
    return { success: true }
  } catch (error) {
    const graphError = error as GraphError
    console.error('Error sending Outlook email:', {
      error,
      message: graphError.message || 'Unknown error',
      stack: graphError.stack,
      statusCode: graphError.statusCode,
      code: graphError.code,
      requestId: graphError.requestId,
      body: graphError.body
    })
    throw error
  }
} 