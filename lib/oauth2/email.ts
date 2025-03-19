import { createGmailOAuth2Client } from './config'
import { google } from 'googleapis'
import { Database } from '@/types/supabase'
import { OUTLOOK_CONFIG } from './config'
import { createClient } from '@supabase/supabase-js'

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

async function getAccessToken(integration: EmailIntegration): Promise<string> {
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

    return tokens.access_token
  } catch (error) {
    console.error('Error getting access token:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    throw error
  }
}

async function sendOutlookEmail(
  integration: EmailIntegration,
  to: string,
  subject: string,
  content: string
): Promise<{ success: boolean }> {
  try {
    console.log('Attempting to send email:', {
      to,
      hasSubject: !!subject,
      contentLength: content.length,
      userEmail: integration.email
    })

    const accessToken = await getAccessToken(integration)
    const requestId = crypto.randomUUID()

    // First verify token and permissions
    const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'client-request-id': requestId,
        'return-client-request-id': 'true'
      }
    })

    console.log('User info response:', {
      status: userInfoResponse.status,
      statusText: userInfoResponse.statusText,
      body: await userInfoResponse.text()
    })

    // Use the direct sendMail endpoint that we know works
    const sendMailResponse = await fetch(
      `https://graph.microsoft.com/v1.0/users/${integration.email}/sendMail`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'client-request-id': requestId,
          'return-client-request-id': 'true'
        },
        body: JSON.stringify({
          message: {
            subject,
            body: {
              contentType: "html",
              content: `<html><body>${content}</body></html>`
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
      }
    )

    const responseText = await sendMailResponse.text()
    console.log('Send mail response:', {
      status: sendMailResponse.status,
      statusText: sendMailResponse.statusText,
      headers: Object.fromEntries(sendMailResponse.headers.entries()),
      body: responseText,
      requestId
    })

    if (!sendMailResponse.ok) {
      throw new Error(
        `Failed to send email: ${sendMailResponse.status} ${sendMailResponse.statusText}\n` +
        `Response: ${responseText}`
      )
    }

    return { success: true }
  } catch (error) {
    console.error('Error sending Outlook email:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    throw error
  }
} 