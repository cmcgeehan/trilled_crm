import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const userData = await request.json()
    console.log('API: Received user data:', userData)
    
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    
    // Verify user is authenticated and has appropriate role
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      console.log('API: No session found')
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { data: currentUser, error: userError } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', session.user.id)
      .single()

    if (userError) {
      console.error('API: Error fetching current user:', userError)
      return new NextResponse(`Error fetching current user: ${userError.message}`, { status: 500 })
    }

    console.log('API: Current user:', currentUser)

    if (!currentUser || !['admin', 'super_admin'].includes(currentUser.role)) {
      console.log('API: User not authorized:', currentUser?.role)
      return new NextResponse('Forbidden', { status: 403 })
    }

    // If admin, can only create users in their organization
    if (currentUser.role === 'admin' && userData.organization_id !== currentUser.organization_id) {
      console.log('API: Organization mismatch:', {
        userOrg: userData.organization_id,
        currentUserOrg: currentUser.organization_id
      })
      return new NextResponse('Forbidden - Cannot create users in different organizations', { status: 403 })
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

    const { data: newUser, error: insertError } = await supabase
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
      return new NextResponse(`Database Error: ${insertError.message}`, { status: 500 })
    }

    console.log('API: Successfully created user:', newUser)
    return NextResponse.json(newUser)
  } catch (error) {
    console.error('API: Error in create route:', error)
    return new NextResponse(`Internal Server Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { status: 500 })
  }
} 