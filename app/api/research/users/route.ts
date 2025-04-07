import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { Database } from '@/types/supabase'
import { createCookieHandlers, copyResponseHeaders } from '@/lib/server-utils'

// Define allowed methods and runtime settings
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json',
}

// Handle all HTTP methods to properly respond to OPTIONS and invalid methods
export async function GET(request: Request) {
  const response = new NextResponse()
  const cookieHandlers = createCookieHandlers(request, response)
  
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: cookieHandlers
    }
  )

  try {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    // Copy headers from response to the final response
    const finalResponse = NextResponse.json(users)
    return copyResponseHeaders(response, finalResponse)
  } catch (error) {
    console.error('Error fetching users:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function PUT() {
  return new NextResponse(null, { 
    status: 405,
    headers: {
      ...corsHeaders,
      'Allow': 'POST, OPTIONS'
    }
  })
}

export async function DELETE() {
  return new NextResponse(null, { 
    status: 405,
    headers: {
      ...corsHeaders,
      'Allow': 'POST, OPTIONS'
    }
  })
}

export async function POST(request: Request) {
  const response = new NextResponse()
  const cookieHandlers = createCookieHandlers(request, response)
  
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: cookieHandlers
    }
  )

  try {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const body = await request.json()
    console.log('Received user creation request from AI:', body)

    const { companyId, name, email, position, ownerId } = body

    if (!companyId || !name || !email || !ownerId) {
      return new NextResponse(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400 }
      )
    }

    // Split name into first and last name
    const [firstName, ...lastNameParts] = name.split(' ')
    const lastName = lastNameParts.join(' ')

    // Define the user data type
    type UserInsert = Database['public']['Tables']['users']['Insert']
    
    // Insert the user into the database
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        first_name: firstName,
        last_name: lastName || null,
        email: email,
        position: position,
        company_id: companyId,
        owner_id: ownerId,
        role: 'lead',
        status: 'new'
      } satisfies UserInsert)
      .select()
      .single()

    if (error) {
      console.error('Error creating user:', error)
      return new NextResponse(
        JSON.stringify({ error: 'Failed to create user' }),
        { status: 500 }
      )
    }

    // Copy headers from response to the final response
    const finalResponse = NextResponse.json(user)
    return copyResponseHeaders(response, finalResponse)
  } catch (error) {
    console.error('Error in user creation:', error)
    return new NextResponse(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders
  })
} 