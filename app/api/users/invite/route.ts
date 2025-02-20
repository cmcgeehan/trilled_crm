import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Ensure environment variables exist
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing environment variables for Supabase')
}

const adminClient = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function POST(request: Request) {
  try {
    const { email, userData } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // First try to get the user by listing users and filtering
    const { data: users, error: listError } = await adminClient.auth.admin.listUsers()
    
    if (listError) {
      console.error('Error listing users:', listError)
      return NextResponse.json({ error: 'Failed to check for existing user' }, { status: 500 })
    }
    
    const existingUser = users?.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    
    if (existingUser) {
      console.log('Found existing user:', existingUser)
      return NextResponse.json({ user: existingUser })
    }

    // If user doesn't exist, create them
    console.log('Creating new user with email:', email)
    
    // Generate initial password as concatenation of user data (without last name)
    const initialPassword = `${userData.first_name.toLowerCase()}${email.toLowerCase()}${(userData.role || 'agent').toLowerCase()}`

    // Create the user with the initial password
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password: initialPassword,
      email_confirm: true,
      user_metadata: {
        ...userData,
        name: `${userData.first_name} ${userData.last_name}`.trim()
      }
    })

    if (error) {
      // If we get an email_exists error, try to get the user one more time
      if (error.status === 422 && error.message.includes('already been registered')) {
        const { data: retryUsers, error: retryError } = await adminClient.auth.admin.listUsers()
        
        if (retryError) {
          console.error('Error retrying user list:', retryError)
          return NextResponse.json({ error: 'Failed to verify user creation' }, { status: 500 })
        }
        
        const retryUser = retryUsers?.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
        if (retryUser) {
          console.log('Found user on retry:', retryUser)
          return NextResponse.json({ user: retryUser })
        }
      }
      
      console.error('User creation error:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (!data.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 400 })
    }

    console.log('Successfully created new user:', data.user)
    return NextResponse.json({ user: data.user })
  } catch (error) {
    console.error('Error in invite route:', error)
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    )
  }
} 