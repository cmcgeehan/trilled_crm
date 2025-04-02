import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { calculateFollowUpDates } from '@/lib/utils'

// Ensure required environment variables are present
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables')
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
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
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            const cookie = request.headers.get('cookie')
            if (!cookie) return undefined
            const match = cookie.match(new RegExp(`${name}=([^;]+)`))
            return match ? match[1] : undefined
          },
          set() {
            // Cookies are handled by middleware
          },
          remove() {
            // Cookies are handled by middleware
          },
        },
      }
    )
    
    // Verify user is authenticated and has appropriate role
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      console.log('API: No session found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current user's role and organization
    const { data: currentUser } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', session.user.id)
      .single()

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

    const insertData = {
      id: userData.id,
      first_name: userData.first_name,
      last_name: userData.last_name,
      email: userData.email === '' ? null : userData.email,
      phone: userData.phone,
      position: userData.position,
      role: userData.role,
      status: userData.status,
      company_id: userData.company_id || null,
      owner_id: userData.owner_id || (currentUser.role === 'agent' ? session.user.id : null),
      organization_id: userData.organization_id,
      notes: userData.notes,
      created_at: userData.created_at || new Date().toISOString(),
      created_by: session.user.id
    }

    console.log('API: Attempting to create user with data:', insertData)

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', userData.email)
      .single()

    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 })
    }

    let userId = userData.id

    // Only create auth user for roles that need authentication
    if (['agent', 'admin', 'super_admin'].includes(userData.role)) {
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
      if (['agent', 'admin', 'super_admin'].includes(userData.role)) {
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
        user_id: userId,
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

    console.log('API: Successfully created user:', createdUser)
    return NextResponse.json(createdUser)
  } catch (error) {
    console.error('API: Error in create route:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
} 