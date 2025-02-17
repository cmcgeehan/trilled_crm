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
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { data: currentUser } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', session.user.id)
      .single()

    if (!currentUser || !['admin', 'super_admin'].includes(currentUser.role)) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    // If admin, can only update users in their organization
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

    if (currentUser.role === 'admin') {
      updateQuery = updateQuery.eq('organization_id', currentUser.organization_id)
    }

    const { data: updatedUser, error } = await updateQuery.select().single()

    if (error) {
      console.error('Error updating user:', error)
      return new NextResponse('Internal Server Error', { status: 500 })
    }

    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error('Error in update route:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
} 