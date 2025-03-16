import { createGmailOAuth2Client } from './config'
import { google } from 'googleapis'
import { Database } from '@/types/supabase'
import { Client } from '@microsoft/microsoft-graph-client'
import { OUTLOOK_CONFIG } from './config'
import { createClient } from '@supabase/supabase-js'
import type { GraphError } from './types'

type EmailIntegration = Database['public']['Tables']['email_integrations']['Row']

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
  // Create an authentication provider that handles token refresh
  const authProvider = {
    getAccessToken: async () => {
      try {
        console.log('Getting access token for email integration:', {
          hasAccessToken: !!integration.access_token,
          hasRefreshToken: !!integration.refresh_token,
          tokenExpiresAt: integration.token_expires_at,
          email: integration.email
        })

        // Always try to refresh the token to ensure we have a fresh one
        if (!integration.refresh_token) {
          console.error('No refresh token available')
          throw new Error('No refresh token available - please reconnect your email integration')
        }

        // Get a new token using the refresh token
        const tokenEndpoint = `${OUTLOOK_CONFIG.authority}/oauth2/v2.0/token`
        const tokenRequest = new URLSearchParams({
          client_id: OUTLOOK_CONFIG.clientId,
          client_secret: OUTLOOK_CONFIG.clientSecret,
          refresh_token: integration.refresh_token,
          grant_type: 'refresh_token',
          scope: OUTLOOK_CONFIG.scopes.join(' ')
        })

        console.log('Requesting token refresh with scopes:', OUTLOOK_CONFIG.scopes.join(' '))

        const response = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: tokenRequest
        })

        const responseText = await response.text()
        console.log('Token refresh response:', {
          status: response.status,
          statusText: response.statusText,
          responseText
        })

        if (!response.ok) {
          if (response.status === 400 && responseText.includes('invalid_grant')) {
            throw new Error('Refresh token is invalid or expired - please reconnect your email integration')
          }
          throw new Error(`Failed to refresh token: ${response.status} ${response.statusText} - ${responseText}`)
        }

        let tokens
        try {
          tokens = JSON.parse(responseText)
        } catch (e) {
          console.error('Failed to parse token response:', e)
          throw new Error('Invalid token response from Microsoft')
        }

        if (!tokens.access_token) {
          console.error('No access token in refresh response:', tokens)
          throw new Error('No access token received from Microsoft')
        }

        console.log('Token refresh successful:', {
          hasAccessToken: !!tokens.access_token,
          hasRefreshToken: !!tokens.refresh_token,
          expiresIn: tokens.expires_in
        })

        // Update the integration with new tokens
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        
        const { error: updateError } = await supabase
          .from('email_integrations')
          .update({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || integration.refresh_token,
            token_expires_at: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', integration.id)

        if (updateError) {
          console.error('Failed to update integration tokens:', updateError)
          // Continue with the new access token even if we couldn't save it
        }

        // Update the local integration object with the new tokens
        integration.access_token = tokens.access_token
        integration.refresh_token = tokens.refresh_token || integration.refresh_token
        integration.token_expires_at = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString()

        return tokens.access_token
      } catch (error) {
        console.error('Error getting access token:', {
          error,
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        })
        throw error // Preserve the original error message
      }
    }
  }

  try {
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

    console.log('Attempting to send email:', {
      to,
      hasSubject: !!subject,
      contentLength: content?.length,
      userEmail: integration.email
    })

    // Send mail using Microsoft Graph API with delegated permissions
    const response = await graphClient
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
          ],
          from: {
            emailAddress: {
              address: integration.email
            }
          }
        },
        saveToSentItems: true
      })

    console.log('Email sent successfully:', response)
    return { success: true }
  } catch (error: unknown) {
    const graphError = error as GraphError;
    console.error('Error sending Outlook email:', {
      error: graphError,
      message: graphError instanceof Error ? graphError.message : 'Unknown error',
      stack: graphError instanceof Error ? graphError.stack : undefined,
      statusCode: graphError.statusCode,
      code: graphError.code,
      requestId: graphError.requestId
    })

    // If we get a 401, try refreshing the token one more time
    if (graphError.statusCode === 401) {
      try {
        console.log('Got 401, attempting one more token refresh...')
        const newToken = await authProvider.getAccessToken()
        
        // Try sending the email again with the new token
        const graphClient = Client.init({
          authProvider: async (done) => done(null, newToken)
        })

        const response = await graphClient
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
              ],
              from: {
                emailAddress: {
                  address: integration.email
                }
              }
            },
            saveToSentItems: true
          })

        console.log('Email sent successfully after token refresh:', response)
        return { success: true }
      } catch (retryError: unknown) {
        const graphRetryError = retryError as GraphError;
        console.error('Error after token refresh retry:', {
          error: graphRetryError,
          message: graphRetryError instanceof Error ? graphRetryError.message : 'Unknown error',
          statusCode: graphRetryError.statusCode,
          code: graphRetryError.code
        })
        throw new Error('Email integration needs to be reconnected - authorization failed after retry')
      }
    }
    
    if (graphError.code === 'ErrorAccessDenied' || graphError.statusCode === 403) {
      throw new Error('Access denied - please check your Microsoft account permissions')
    }

    if (graphError.code === 'ErrorInvalidRecipients') {
      throw new Error('Invalid recipient email address')
    }

    // Handle ReadableStream error body
    if (graphError.body && graphError.body instanceof ReadableStream) {
      try {
        const reader = graphError.body.getReader()
        const { value } = await reader.read()
        const errorText = new TextDecoder().decode(value)
        console.error('Error body from ReadableStream:', errorText)
        try {
          const errorBody = JSON.parse(errorText)
          if (errorBody.error && errorBody.error.message) {
            throw new Error(`Microsoft Graph API error: ${errorBody.error.message}`)
          }
        } catch {
          // If we can't parse the JSON, just use the raw error text
          throw new Error(`Microsoft Graph API error: ${errorText}`)
        }
      } catch {
        // If we can't read the stream, throw a generic error
        throw new Error('Failed to send email - please try reconnecting your email integration')
      }
    }
    
    // If we couldn't match a specific error type, throw a generic error with the original message
    throw new Error(`Failed to send email: ${graphError.message || 'Unknown error'}`)
  }
} 