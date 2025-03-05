import { OAuth2Client } from 'google-auth-library'

// Gmail OAuth2 configuration
export const GMAIL_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  redirectUri: process.env.GOOGLE_REDIRECT_URI!,
  scopes: [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/userinfo.email'
  ]
}

// Outlook OAuth2 configuration
export const OUTLOOK_CONFIG = {
  clientId: process.env.MICROSOFT_CLIENT_ID!,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
  redirectUri: process.env.MICROSOFT_REDIRECT_URI!,
  scopes: [
    'openid',
    'offline_access',
    'profile',
    'User.Read',
    'Mail.Read',
    'Mail.ReadWrite',
    'Mail.Send'
  ],
  authority: 'https://login.microsoftonline.com/organizations'
}

// Validate Outlook config
if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
  console.error('Missing Microsoft credentials:', {
    hasClientId: !!process.env.MICROSOFT_CLIENT_ID,
    clientIdLength: process.env.MICROSOFT_CLIENT_ID?.length || 0,
    hasClientSecret: !!process.env.MICROSOFT_CLIENT_SECRET,
    clientSecretLength: process.env.MICROSOFT_CLIENT_SECRET?.length || 0
  })
}

// Create Gmail OAuth2 client
export const createGmailOAuth2Client = () => {
  return new OAuth2Client(
    GMAIL_CONFIG.clientId,
    GMAIL_CONFIG.clientSecret,
    GMAIL_CONFIG.redirectUri
  )
}

// Get Gmail authorization URL
export const getGmailAuthUrl = () => {
  const oauth2Client = createGmailOAuth2Client()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_CONFIG.scopes,
    prompt: 'consent'
  })
}

// Get Outlook authorization URL
export const getOutlookAuthUrl = () => {
  const params = new URLSearchParams({
    client_id: OUTLOOK_CONFIG.clientId,
    response_type: 'code',
    redirect_uri: OUTLOOK_CONFIG.redirectUri,
    scope: OUTLOOK_CONFIG.scopes.join(' '),
    response_mode: 'query',
    prompt: 'consent'
  })

  return `${OUTLOOK_CONFIG.authority}/oauth2/v2.0/authorize?${params.toString()}`
} 