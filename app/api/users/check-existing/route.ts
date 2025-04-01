import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { emails } = await request.json()
    
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options })
          },
        },
      }
    )
    
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