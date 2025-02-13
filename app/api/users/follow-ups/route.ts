import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Ensure environment variables exist
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing environment variables for Supabase')
}

const adminClient = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function POST(request: Request) {
  try {
    const { followUps } = await request.json()

    // Insert all follow-ups at once
    const { data: newFollowUps, error: followUpError } = await adminClient
      .from('follow_ups')
      .insert(followUps)
      .select()

    if (followUpError) {
      console.error('Follow-up creation error:', followUpError)
      return NextResponse.json({ error: followUpError.message }, { status: 400 })
    }

    // Update next_follow_up_id links
    for (let i = 0; i < newFollowUps.length - 1; i++) {
      const { error: updateError } = await adminClient
        .from('follow_ups')
        .update({ next_follow_up_id: newFollowUps[i + 1].id })
        .eq('id', newFollowUps[i].id)

      if (updateError) {
        console.error('Follow-up link update error:', updateError)
        return NextResponse.json({ error: updateError.message }, { status: 400 })
      }
    }

    return NextResponse.json({ followUps: newFollowUps })
  } catch (error) {
    console.error('Error creating follow-ups:', error)
    return NextResponse.json(
      { error: 'Failed to create follow-ups' },
      { status: 500 }
    )
  }
} 