import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const userData = await request.json()
    
    const supabase = createRouteHandlerClient({ cookies })
    
    // Verify user is authenticated and has appropriate role
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: currentUser } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', session.user.id)
      .single()

    if (!currentUser || !['admin', 'super_admin', 'agent'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden - Insufficient permissions' }, { status: 403 })
    }

    // Get the user's current role before update
    const { data: existingUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', userData.id)
      .single()

    if (!existingUser) {
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

    // If admin or agent, can only update users in their organization
    let updateQuery = supabase
      .from('users')
      .update({
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
        notes: userData.notes
      })
      .eq('id', userData.id)

    if (currentUser.role !== 'super_admin') {
      updateQuery = updateQuery.eq('organization_id', currentUser.organization_id)
    }

    const { data: updatedUser, error } = await updateQuery.select().single()

    if (error) {
      console.error('Error updating user:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error('Error in update route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 