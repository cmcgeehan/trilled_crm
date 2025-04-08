import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/supabase'
import { calculateFollowUpDates } from '@/lib/utils'
import { createCookieHandlers } from '@/lib/server-utils'

// Ensure required environment variables are present
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables')
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const response = new NextResponse()
  const cookieHandlers = createCookieHandlers(request, response)

  try {
    const userData = await request.json()
    console.log('API: Received user data:', userData)
    
    // Create a Supabase client with the service role key for admin operations
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

    // Create a regular client for session verification
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: cookieHandlers
      }
    )
    
    // Verify user is authenticated and has appropriate role
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.log('API: No authenticated user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current user's role and organization
    const { data: currentUser, error: userError } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (userError) {
      console.error('API: Error fetching current user:', userError)
      return NextResponse.json({ error: 'Error fetching user data' }, { status: 500 })
    }

    if (!currentUser) {
      console.log('API: User not found')
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if user has permission to create users
    if (!['admin', 'super_admin', 'agent'].includes(currentUser.role)) {
      console.log('API: User not authorized:', currentUser?.role)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Check role hierarchy permissions
    if (userData.role) {
      // Super admins can create any role except super_admin
      if (currentUser.role === 'super_admin') {
        if (userData.role === 'super_admin') {
          return NextResponse.json({ error: 'Cannot create super_admin users' }, { status: 403 })
        }
      }
      // Admins can only create agents, leads, and customers
      else if (currentUser.role === 'admin') {
        if (!['agent', 'lead', 'customer'].includes(userData.role)) {
          return NextResponse.json({ error: 'Admins can only create agents, leads, and customers' }, { status: 403 })
        }
      }
      // Agents can only create leads and customers
      else if (currentUser.role === 'agent') {
        if (!['lead', 'customer'].includes(userData.role)) {
          return NextResponse.json({ error: 'Agents can only create leads and customers' }, { status: 403 })
        }
      }
    }

    // If admin or agent, can only create users in their organization
    if (currentUser.role !== 'super_admin' && userData.organization_id !== currentUser.organization_id) {
      console.log('API: Organization mismatch:', {
        userOrg: userData.organization_id,
        currentUserOrg: currentUser.organization_id
      })
      return NextResponse.json({ error: 'Forbidden - Cannot create users in different organizations' }, { status: 403 })
    }

    // Check if user already exists
    if (userData.email) {
      const { data: existingUser, error: existingUserError } = await supabase
        .from('users')
        .select('id')
        .eq('email', userData.email)
        .maybeSingle()

      if (existingUserError && existingUserError.code !== 'PGRST116') {
        console.error('API: Error checking existing user:', existingUserError)
        return NextResponse.json({ error: 'Error checking for existing user' }, { status: 500 })
      }

      if (existingUser) {
        console.log('API: User already exists with email:', userData.email)
        return NextResponse.json({ error: 'User already exists' }, { status: 400 })
      }
    }

    // Validate required fields based on role
    if (userData.role === 'lead') {
      if (!userData.lead_type) {
        console.log('API: Missing required field for lead:', { lead_type: userData.lead_type })
        return NextResponse.json({ error: 'Lead type is required for lead users' }, { status: 400 })
      }
    }

    let userId: string | undefined

    // Only create auth user for roles that need authentication
    if (['agent', 'admin', 'super_admin'].includes(userData.role)) {
      if (!userData.email || !userData.password) {
        console.log('API: Missing required fields for agent/admin:', { 
          email: !!userData.email, 
          password: !!userData.password 
        })
        return NextResponse.json({ error: 'Email and password are required for agent/admin users' }, { status: 400 })
      }

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: userData.email,
        password: userData.password,
        email_confirm: true,
      })

      if (authError) {
        console.error('API: Error creating auth user:', authError)
        return NextResponse.json({ error: authError.message }, { status: 400 })
      }

      userId = authData.user.id
    }

    const insertData = {
      first_name: userData.first_name,
      last_name: userData.last_name,
      email: userData.email === '' ? null : userData.email,
      phone: userData.phone,
      position: userData.position,
      role: userData.role,
      status: userData.status,
      company_id: userData.company_id || null,
      owner_id: userData.owner_id || (currentUser.role === 'agent' ? user.id : null),
      organization_id: userData.organization_id,
      notes: userData.notes,
      created_at: userData.created_at || new Date().toISOString(),
      created_by: user.id,
      lead_type: userData.lead_type,
      linkedin: userData.linkedin,
      lead_source: userData.lead_source,
      referrer_id: userData.referral_company_id
    }

    console.log('API: Attempting to create user with data:', insertData)

    // Insert user into database
    const { data: createdUser, error: insertError } = await supabase
      .from('users')
      .insert({
        ...insertData,
        id: userId
      })
      .select()
      .single()

    if (insertError) {
      console.error('API: Error inserting user:', insertError)
      // If insert fails and we created an auth user, delete it
      if (userId) {
        await supabase.auth.admin.deleteUser(userId)
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // If user is a lead or customer, create follow-ups
    if (['lead', 'customer'].includes(userData.role)) {
      const followUpDates = calculateFollowUpDates(new Date(), userData.role)
      const followUpsToCreate = followUpDates.map(date => ({
        date: date.toISOString(),
        type: 'email',
        user_id: createdUser.id,
        completed_at: null,
        next_follow_up_id: null
      }))

      // Insert all follow-ups
      const { data: newFollowUps, error: followUpError } = await supabaseAdmin
        .from('follow_ups')
        .insert(followUpsToCreate)
        .select()

      if (followUpError) {
        console.error('API: Error creating follow-ups:', followUpError)
      } else if (newFollowUps && newFollowUps.length > 1) {
        // Update next_follow_up_id links
        for (let i = 0; i < newFollowUps.length - 1; i++) {
          await supabaseAdmin
            .from('follow_ups')
            .update({ next_follow_up_id: newFollowUps[i + 1].id })
            .eq('id', newFollowUps[i].id)
        }
      }
    }

    // Return the created user
    return NextResponse.json(createdUser)
  } catch (error) {
    console.error('API: Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 