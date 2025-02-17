import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { emails, organizationId } = await request.json()
    
    const cookieStore = cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    
    // Verify user is authenticated and has appropriate role
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { data: currentUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single()

    if (!currentUser || !['admin', 'super_admin'].includes(currentUser.role)) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    // Get owners
    let ownersQuery = supabase
      .from('users')
      .select('id, email, role')
      .in('email', emails)
      .in('role', ['agent', 'admin', 'super_admin'])

    if (currentUser.role === 'admin' && organizationId) {
      ownersQuery = ownersQuery.eq('organization_id', organizationId)
    }

    const { data: owners, error } = await ownersQuery
    if (error) {
      console.error('Error checking owners:', error)
      return new NextResponse('Internal Server Error', { status: 500 })
    }

    return NextResponse.json(owners)
  } catch (error) {
    console.error('Error in check-owners route:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
} 