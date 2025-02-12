import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
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
    
    // Insert the new customer using service role client
    const { data: newCustomer, error: customerError } = await supabaseAdmin
      .from('users')
      .insert([userData])
      .select()
      .single()

    if (customerError) {
      console.error('Error creating customer:', customerError)
      return NextResponse.json(
        { error: customerError.message },
        { status: 400 }
      )
    }

    return NextResponse.json(newCustomer)
  } catch (err) {
    console.error('Error in user creation:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 