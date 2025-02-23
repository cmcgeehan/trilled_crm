import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

// Create a Supabase client with the service role key for admin operations
const adminClient = createClient(
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
    
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    
    // Verify user is authenticated and has appropriate role
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use admin client for fetching current user to avoid cookie issues
    const { data: currentUser, error: currentUserError } = await adminClient
      .from('users')
      .select('role, organization_id')
      .eq('id', session.user.id)
      .single()

    if (currentUserError || !currentUser || !['admin', 'super_admin', 'agent'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden - Insufficient permissions' }, { status: 403 })
    }

    // Get the user's current role before update using admin client
    const { data: existingUser, error: existingUserError } = await adminClient
      .from('users')
      .select('role, organization_id')
      .eq('id', userData.id)
      .single()

    if (existingUserError || !existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check role hierarchy permissions for role changes
    if (userData.role && userData.role !== existingUser.role) {
      // Super admins can update to any role except super_admin
      if (currentUser.role === 'super_admin') {
        if (userData.role === 'super_admin') {
          return NextResponse.json({ error: 'Cannot create super_admin users' }, { status: 403 })
        }
      }
      // Admins can only update to agent, lead, or customer
      else if (currentUser.role === 'admin') {
        if (!['agent', 'lead', 'customer'].includes(userData.role)) {
          return NextResponse.json({ error: 'Admins can only update users to agent, lead, or customer roles' }, { status: 403 })
        }
      }
      // Agents can only update to lead or customer
      else if (currentUser.role === 'agent') {
        if (!['lead', 'customer'].includes(userData.role)) {
          return NextResponse.json({ error: 'Agents can only update users to lead or customer roles' }, { status: 403 })
        }
      }
    }

    // Check organization permissions
    if (currentUser.role !== 'super_admin' && existingUser.organization_id !== currentUser.organization_id) {
      return NextResponse.json({ error: 'Cannot update users from different organizations' }, { status: 403 })
    }

    // If admin or agent, can only update users in their organization
    const updateData = {
      first_name: userData.first_name,
      last_name: userData.last_name,
      email: userData.email,
      phone: userData.phone,
      position: userData.position,
      role: userData.role,
      status: userData.status,
      company_id: userData.company_id,
      owner_id: userData.owner_id,
      notes: userData.notes
    }

    // Use admin client for the update operation
    const { data: updatedUser, error: updateError } = await adminClient
      .from('users')
      .update(updateData)
      .eq('id', userData.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating user:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    if (!updatedUser) {
      return NextResponse.json({ error: 'Failed to update user' }, { status: 404 })
    }

    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error('Error in update route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 