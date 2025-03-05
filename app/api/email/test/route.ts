import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/oauth2/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    // Get Supabase client
    const supabase = createRouteHandlerClient({ cookies })
    
    // Get current user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session) {
      throw new Error('Not authenticated')
    }

    // Get the user's email integration
    const { data: integrations, error: integrationError } = await supabase
      .from('email_integrations')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('provider', 'outlook')
      .is('deleted_at', null)
      .single()

    if (integrationError || !integrations) {
      throw new Error('No Outlook integration found')
    }

    // Send a test email
    const result = await sendEmail(
      integrations,
      integrations.email, // Send to self
      'Test Email from Trilled CRM',
      `
        <h1>Test Email</h1>
        <p>This is a test email sent from your Trilled CRM Outlook integration.</p>
        <p>If you're seeing this, the integration is working correctly!</p>
        <p>Sent at: ${new Date().toISOString()}</p>
      `
    )

    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('Error sending test email:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send test email' },
      { status: 500 }
    )
  }
} 