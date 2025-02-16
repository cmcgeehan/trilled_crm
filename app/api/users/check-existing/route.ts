import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { emails } = await request.json()
    
    const supabase = createRouteHandlerClient({ cookies })
    
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

    // Get existing users
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email')
      .in('email', emails)

    if (error) {
      console.error('Error checking existing users:', error)
      return new NextResponse('Internal Server Error', { status: 500 })
    }

    return NextResponse.json(users)
  } catch (error) {
    console.error('Error in check-existing route:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
} 