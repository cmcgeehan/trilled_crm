import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return handleRequest(request)
}

export async function PUT(request: Request) {
  return handleRequest(request)
}

async function handleRequest(request: Request) {
  try {
    const updates = await request.json()
    
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: currentUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single()

    if (!currentUser || !['admin', 'super_admin'].includes(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Extract the user ID from the updates
    const { id, ...updateData } = updates

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Update the user
    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating user:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error('Error in users update route:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal Server Error' 
    }, { status: 500 })
  }
} 