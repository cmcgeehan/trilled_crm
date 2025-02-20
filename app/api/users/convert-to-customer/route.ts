import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { calculateFollowUpDates } from '@/lib/utils'

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
    const { userId } = await request.json()
    const now = new Date()

    // First, get the lead's owner_id
    const { data: userData, error: userError } = await adminClient
      .from('users')
      .select('owner_id')
      .eq('id', userId)
      .single()

    if (userError) {
      console.error('Error fetching user:', userError)
      return NextResponse.json({ error: userError.message }, { status: 400 })
    }

    // Delete all future (incomplete) follow-ups
    const { error: deleteError } = await adminClient
      .from('follow_ups')
      .delete()
      .eq('user_id', userId)
      .is('completed_at', null)

    if (deleteError) {
      console.error('Error deleting follow-ups:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 400 })
    }

    // Update user to customer role and set won status
    const { error: updateError } = await adminClient
      .from('users')
      .update({
        role: 'customer',
        status: 'won',
        won_at: now.toISOString(),
        won_by: userData.owner_id // Set won_by to the lead's owner
      })
      .eq('id', userId)

    if (updateError) {
      console.error('Error updating user:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    // Calculate new follow-up dates starting from today
    const followUpDates = calculateFollowUpDates(now, 'customer')
    
    // Create new follow-ups for customer sequence
    const followUpsToCreate = followUpDates.map(date => ({
      user_id: userId,
      date: date.toISOString(),
      type: 'email',
      completed_at: null
    }))

    // Insert new follow-ups
    const { data: newFollowUps, error: insertError } = await adminClient
      .from('follow_ups')
      .insert(followUpsToCreate)
      .select()

    if (insertError) {
      console.error('Error creating follow-ups:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 400 })
    }

    // Update next_follow_up_id links
    if (newFollowUps) {
      for (let i = 0; i < newFollowUps.length - 1; i++) {
        await adminClient
          .from('follow_ups')
          .update({ next_follow_up_id: newFollowUps[i + 1].id })
          .eq('id', newFollowUps[i].id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in convert-to-customer route:', error)
    return NextResponse.json(
      { error: 'Failed to convert lead to customer' },
      { status: 500 }
    )
  }
} 