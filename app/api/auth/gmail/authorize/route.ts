import { getGmailAuthUrl } from '@/lib/oauth2/config'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const url = getGmailAuthUrl()
    return NextResponse.json({ url })
  } catch (error) {
    console.error('Error getting Gmail auth URL:', error)
    return NextResponse.json(
      { error: 'Failed to get Gmail authorization URL' },
      { status: 500 }
    )
  }
} 