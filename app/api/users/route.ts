import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { Database } from '@/types/supabase'

export async function POST(request: Request) {
  try {
    // Create a Supabase client for the route handler
    const supabase = createRouteHandlerClient<Database>({ cookies })
    
    const userData = await request.json()
    
    // Insert the new customer
    const { data: newCustomer, error: customerError } = await supabase
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