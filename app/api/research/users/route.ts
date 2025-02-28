import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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
export async function GET() {
  return new NextResponse(null, { 
    status: 405,
    headers: {
      ...corsHeaders,
      'Allow': 'POST, OPTIONS'
    }
  })
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
  try {
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
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating user:', error)
      return new NextResponse(
        JSON.stringify({ error: 'Failed to create user' }),
        { status: 500 }
      )
    }

    return new NextResponse(
      JSON.stringify(user),
      { status: 200 }
    )
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