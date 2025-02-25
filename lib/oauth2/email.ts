import { createGmailOAuth2Client } from './config'
import { google } from 'googleapis'
import { Database } from '@/types/supabase'

type EmailIntegration = Database['public']['Tables']['email_integrations']['Row']

export async function sendEmail(
  integration: EmailIntegration,
  to: string,
  subject: string,
  content: string
) {
  if (integration.provider === 'gmail') {
    return sendGmailEmail(integration, to, subject, content)
  }
  // Temporarily disable Outlook integration until fully implemented
  // else if (integration.provider === 'outlook') {
  //   return sendOutlookEmail(integration, to, subject, content)
  // }
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

// Temporarily comment out incomplete Outlook integration
/* async function sendOutlookEmail(
  integration: EmailIntegration,
  to: string,
  subject: string,
  content: string
) {
  // Create an authentication provider
  const authProvider = {
    getAccessToken: async () => {
      // Here you would implement token refresh if needed
      return integration.access_token
    }
  }

  // Initialize the Graph client
  const graphClient = Client.initWithMiddleware({
    authProvider: new TokenCredentialAuthenticationProvider(authProvider)
  })

  try {
    // Send mail using Microsoft Graph API
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
        }
      })
  } catch (error) {
    console.error('Error sending Outlook email:', error)
    throw error
  }
} */ 