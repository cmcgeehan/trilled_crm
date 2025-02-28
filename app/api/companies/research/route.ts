import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

type AIResearchResponse = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  position?: string;
  company_id?: string;
  owner_id?: string;
  status?: string;
  errors?: Array<{
    body: string;
    step_name: string;
    raw: string;
  }>;
}

// Define allowed methods
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

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
  // Add CORS headers to the response
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  try {
    // Log incoming request
    console.log('Received research request')
    
    const body = await request.json()
    console.log('Request body:', body)
    
    const { companyName, companyId, requesterId } = body

    // Validate required fields
    if (!companyName) {
      throw new Error('Company name is required')
    }

    if (!companyId) {
      throw new Error('Company ID is required')
    }

    if (!requesterId) {
      throw new Error('Requester ID is required')
    }

    console.log('Making request to AI service with:', {
      companyName,
      companyId,
      requesterId
    })

    // Make request to AI research API
    const response = await fetch('https://api-bcbe5a.stack.tryrelevance.com/latest/studios/df49f13b-7f61-4e9d-9e18-1e40c08ec700/trigger_limited', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "f7c3f59e2585-475f-83ff-5992c33b6b89:sk-Y2ZhM2YwNDAtYWQyMC00YTE3LWE3ZDEtZTNjNTAyY2RkY2Zh"
      },
      body: JSON.stringify({
        "params": {
          "company_name": companyName,
          "role": "Clinical Director",
          "company_id": companyId,
          "requester_id": requesterId,
          "app_url": "https://no-callback-needed.example.com"  // Dummy URL that won't result in actual callbacks
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
      throw new Error(`Failed to fetch AI research: ${response.status} ${response.statusText}`)
    }

    const data: AIResearchResponse = await response.json()
    
    // Log the response for debugging
    console.log('AI API response:', data)
    
    // Even though the status is 'failed', this is expected because the callback will fail
    // The important part is that we can extract the user information from the error message
    let userInfo = null
    if (data.errors?.[0]?.body) {
      try {
        const errorBody = data.errors[0].body;
        // Extract the input JSON object from the error message
        const match = errorBody.match(/input (.*?), output/);
        if (match) {
          const inputJson = JSON.parse(match[1]);
          // The user info is directly in the body object of the input
          if (inputJson.body) {
            const [firstName, ...lastNameParts] = inputJson.body.name.split(' ');
            userInfo = {
              first_name: firstName,
              last_name: lastNameParts.join(' '),
              email: inputJson.body.email,
              position: inputJson.body.position,
              company_id: companyId,
              owner_id: requesterId,
              role: 'lead',
              status: 'new'
            };
          }
        }
      } catch (e) {
        console.error('Error parsing user info from response:', e);
        console.error('Error body:', data.errors?.[0]?.body);
        throw new Error('Failed to parse user information from AI response');
      }
    }

    // Use extracted user info or throw error
    if (!userInfo) {
      console.error('Invalid AI response:', data)
      throw new Error('AI research returned insufficient contact information')
    }

    console.log('Creating user with info:', userInfo);

    // Create the user directly in our database
    const { data: createdUser, error: createError } = await supabase
      .from('users')
      .insert(userInfo)
      .select()
      .single()

    if (createError) {
      console.error('Error creating user:', createError)
      throw new Error('Failed to create user from AI research')
    }

    // Return success response with the created user
    return new NextResponse(JSON.stringify({
      status: 'success',
      message: 'User created successfully',
      user: createdUser
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    })
  } catch (error) {
    // Log detailed error information
    console.error('Error in AI research:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      body: request.body
    })

    return new NextResponse(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to perform AI research' }),
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