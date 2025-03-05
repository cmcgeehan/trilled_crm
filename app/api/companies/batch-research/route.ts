import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Ensure environment variables exist
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing environment variables for Supabase')
}

// Create a function to initialize the Supabase client
async function initSupabaseClient() {
  const supabase = createClient(
    supabaseUrl as string,
    supabaseServiceKey as string,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          'x-my-custom-header': 'service-role'
        }
      }
    }
  )

  // Set auth context to use service role
  await supabase.auth.setSession({
    access_token: supabaseServiceKey as string,
    refresh_token: ''
  })

  return supabase
}

// Define allowed methods
export const dynamic = 'force-dynamic'
export const runtime = 'edge'
export const maxDuration = 300 // Set maximum duration to 300 seconds (5 minutes)

// Handle OPTIONS requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  })
}

export async function POST(request: Request) {
  const supabase = await initSupabaseClient()
  
  // Add CORS headers to the response
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  try {
    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new NextResponse(
        JSON.stringify({ error: 'Not authenticated' }),
        { 
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            ...headers
          }
        }
      )
    }

    // Log incoming request
    console.log('Received batch research request')
    
    const body = await request.json()
    console.log('Request body:', body)
    
    const { companies, requesterId } = body

    // Validate required fields
    if (!companies || !Array.isArray(companies)) {
      throw new Error('Companies array is required')
    }

    if (!requesterId) {
      throw new Error('Requester ID is required')
    }

    // Process each company asynchronously
    const researchPromises = companies.map(async (company) => {
      try {
        // Make request to AI research API
        const response = await fetch('https://api-bcbe5a.stack.tryrelevance.com/latest/studios/df49f13b-7f61-4e9d-9e18-1e40c08ec700/trigger_limited', {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "f7c3f59e2585-475f-83ff-5992c33b6b89:sk-Y2ZhM2YwNDAtYWQyMC00YTE3LWE3ZDEtZTNjNTAyY2RkY2Zh"
          },
          body: JSON.stringify({
            "params": {
              "company_name": company.name,
              "role": "lead",
              "company_id": company.id,
              "requester_id": requesterId,
              "app_url": process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
            },
            "project": "f7c3f59e2585-475f-83ff-5992c33b6b89"
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error('AI API response error:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText,
            url: response.url
          })
          return {
            companyId: company.id,
            status: 'error',
            error: `Failed to fetch AI research: ${response.status} ${response.statusText}`
          }
        }

        return {
          companyId: company.id,
          status: 'success'
        }
      } catch (error) {
        console.error(`Error researching company ${company.id}:`, error)
        return {
          companyId: company.id,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    })

    // Wait for all research requests to complete
    const results = await Promise.all(researchPromises)

    // Return success response with results
    return new NextResponse(JSON.stringify({
      status: 'success',
      results
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    })
  } catch (error) {
    // Log detailed error information
    console.error('Error in batch research:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })

    return new NextResponse(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to perform batch research' }),
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      }
    )
  }
} 