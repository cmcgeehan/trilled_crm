import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { calculateFollowUpDates } from '@/lib/utils'

// Create a Supabase client with the service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function POST(request: Request) {
  try {
    const userData = await request.json()
    console.log('API: Received user data:', userData)
    
    // Use the normal client to check authentication and get the user's session
    const supabase = createRouteHandlerClient({ cookies })
    
    // Verify user is authenticated and has appropriate role
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      console.log('API: No session found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current user's role and organization using the admin client
    const { data: currentUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('role, organization_id')
      .eq('id', session.user.id)
      .single()

    if (userError) {
      console.error('API: Error fetching current user:', userError)
      return NextResponse.json({ error: `Error fetching current user: ${userError.message}` }, { status: 500 })
    }

    console.log('API: Current user:', currentUser)

    if (!currentUser || !['admin', 'super_admin'].includes(currentUser.role)) {
      console.log('API: User not authorized:', currentUser?.role)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // If admin, can only create users in their organization
    if (currentUser.role === 'admin' && userData.organization_id !== currentUser.organization_id) {
      console.log('API: Organization mismatch:', {
        userOrg: userData.organization_id,
        currentUserOrg: currentUser.organization_id
      })
      return NextResponse.json({ error: 'Forbidden - Cannot create users in different organizations' }, { status: 403 })
    }

    const insertData = {
      first_name: userData.first_name,
      last_name: userData.last_name,
      email: userData.email,
      phone: userData.phone,
      position: userData.position,
      role: userData.role,
      status: userData.status,
      company_id: userData.company_id,
      owner_id: userData.owner_id,
      organization_id: userData.organization_id,
      notes: userData.notes,
      created_at: userData.created_at || new Date().toISOString()
    }

    console.log('API: Attempting to create user with data:', insertData)

    // Start a transaction to create both user and follow-ups
    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert(insertData)
      .select()
      .single()

    if (insertError) {
      console.error('API: Supabase error creating user:', {
        error: insertError,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint
      })
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // If user is a lead or customer, create follow-ups
    if (['lead', 'customer'].includes(userData.role)) {
      const followUpDates = calculateFollowUpDates(new Date(), userData.role)
      const followUpsToCreate = followUpDates.map(date => ({
        date: date.toISOString(),
        type: 'email',
        user_id: newUser.id,
        completed: false,
        next_follow_up_id: null
      }))

      // Insert all follow-ups
      const { data: newFollowUps, error: followUpError } = await supabaseAdmin
        .from('follow_ups')
        .insert(followUpsToCreate)
        .select()

      if (followUpError) {
        console.error('API: Error creating follow-ups:', followUpError)
        // Don't return error here, just log it - we still want to return the created user
      } else {
        // Update next_follow_up_id links
        for (let i = 0; i < newFollowUps.length - 1; i++) {
          await supabaseAdmin
            .from('follow_ups')
            .update({ next_follow_up_id: newFollowUps[i + 1].id })
            .eq('id', newFollowUps[i].id)
        }
      }
    }

    console.log('API: Successfully created user:', newUser)
    return NextResponse.json(newUser)
  } catch (error) {
    console.error('API: Error in create route:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
} 