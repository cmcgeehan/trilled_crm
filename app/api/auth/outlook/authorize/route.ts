import { getOutlookAuthUrl } from '@/lib/oauth2/config'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const url = getOutlookAuthUrl()
    return NextResponse.json({ url })
  } catch (error) {
    console.error('Error getting Outlook auth URL:', error)
    return NextResponse.json(
      { error: 'Failed to get Outlook authorization URL' },
      { status: 500 }
    )
  }
} 