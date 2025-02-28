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

type AIResearchResponse = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  position?: string;
  company_id?: string;
  owner_id?: string;
  status?: string;
  company_info?: {
    website?: string;
    street_address?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    type?: string;
    description?: string;
    notes?: string;
  };
  errors?: Array<{
    body: string;
    step_name: string;
    raw: string;
  }>;
  url?: {
    answer: string;
  };
  company_summary?: {
    answer: string;
  };
  credits_used?: Array<{
    name: string;
    value: string;
  }>;
  output?: {
    company_website?: string;
    company_description?: string;
    user_position?: string;
  };
}

// Add new type definitions at the top with other types
type CompanyUpdateData = {
  website?: string;
  street_address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  type?: string;
  description?: string;
  notes?: string;
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

// Helper function to extract company info from AI response
function extractCompanyInfo(data: AIResearchResponse) {
  let companyInfo = null;

  // Check if we have data in the output field
  if (data.output?.company_website || data.output?.company_description) {
    companyInfo = {
      website: data.output.company_website || '',
      street_address: '',
      neighborhood: '',
      city: '',
      state: '',
      postal_code: '',
      country: '',
      type: '',
      description: data.output.company_description || '',
      notes: ''  // Keep notes field empty since we're using description for the main content
    };
  }

  if (companyInfo) {
    console.log('Extracted company info:', companyInfo);
    
    // Check if we actually have any non-empty values
    const hasNonEmptyValues = Object.values(companyInfo).some(value => value && value.trim() !== '');
    if (!hasNonEmptyValues) {
      console.log('Company info has no non-empty values, setting to null');
      companyInfo = null;
    }
  }

  // Log company info status
  console.log('Final company info status:', {
    hasCompanyInfo: !!companyInfo,
    companyInfo
  });

  return companyInfo;
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
    // Log incoming request
    console.log('Received research request')
    
    const body = await request.json()
    console.log('Request body:', body)
    
    const { companyName, companyId, requesterId, role } = body

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

    if (!role) {
      throw new Error('Role is required')
    }

    console.log('Making request to AI service with:', {
      companyName,
      companyId,
      requesterId,
      role
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
          "role": role,
          "company_id": companyId,
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
      throw new Error(`Failed to fetch AI research: ${response.status} ${response.statusText}`)
    }

    const data: AIResearchResponse = await response.json()
    
    // Log the response for debugging
    console.log('AI API response:', data)
    
    // Check if the AI response indicates a failure
    if (data.status === 'failed') {
      // Extract useful information from the error if possible
      const errorInfo = data.errors?.[0]?.body || 'No results returned'
      if (errorInfo.includes('fetch failed')) {
        // This is an expected error from the callback attempt - we can still process the data
        console.log('Ignoring callback error and processing available data')
      } else {
        throw new Error('AI research failed: ' + errorInfo)
      }
    }

    // Extract user info from output
    let userInfo = null;
    if (data.output?.user_position) {
      try {
        const userPosition = JSON.parse(data.output.user_position);
        const [firstName, ...lastNameParts] = userPosition.name.split(' ');
        userInfo = {
          first_name: firstName,
          last_name: lastNameParts.join(' '),
          email: `${firstName.toLowerCase()}.${lastNameParts.join('').toLowerCase()}@example.com`, // This could be improved
          position: userPosition.role,
          company_id: companyId,
          owner_id: requesterId,
          role: 'lead',
          status: 'new'
        };
      } catch (e) {
        console.error('Error parsing user position:', e);
      }
    }

    // If we couldn't get user info from output, try direct response
    if (!userInfo && data.first_name) {
      userInfo = {
        first_name: data.first_name,
        last_name: data.last_name || '',
        email: data.email || '',
        position: data.position || '',
        company_id: companyId,
        owner_id: requesterId,
        role: 'lead',
        status: 'new'
      };
    }

    // Extract company info from the AI response data
    console.log('Raw AI response data:', data);
    const companyInfo = extractCompanyInfo(data);

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

    // Update company if we have company info
    let updatedCompany = null
    if (companyInfo) {
      console.log('Attempting to update company with info:', companyInfo);
      
      try {
        // Get existing company first
        const { data: existingCompany, error: fetchError } = await supabase
          .from('companies')
          .select('*')
          .eq('id', companyId)
          .single()

        if (fetchError) {
          console.error('Error fetching company:', fetchError)
          throw fetchError;
        }

        console.log('Found existing company:', existingCompany);

        // Prepare update data
        const updateData: CompanyUpdateData = {};
        
        // Only update fields that have values
        if (companyInfo.website) updateData.website = companyInfo.website;
        if (companyInfo.street_address) updateData.street_address = companyInfo.street_address;
        if (companyInfo.neighborhood) updateData.neighborhood = companyInfo.neighborhood;
        if (companyInfo.city) updateData.city = companyInfo.city;
        if (companyInfo.state) updateData.state = companyInfo.state;
        if (companyInfo.postal_code) updateData.postal_code = companyInfo.postal_code;
        if (companyInfo.country) updateData.country = companyInfo.country;
        if (companyInfo.type) updateData.type = companyInfo.type;
        if (companyInfo.description) updateData.description = companyInfo.description;
        
        // Handle notes specially - always update if we have new notes
        if (companyInfo.notes) {
          updateData.notes = existingCompany.notes
            ? `${existingCompany.notes}\n\nAI Research Update (${new Date().toISOString()}):\n${companyInfo.notes}`
            : `AI Research Update (${new Date().toISOString()}):\n${companyInfo.notes}`;
        }

        console.log('Prepared update data:', updateData);

        // Only update if we have data to update
        if (Object.keys(updateData).length > 0) {
          console.log('Updating company with data:', updateData);
          const { data: companyData, error: updateError } = await supabase
            .from('companies')
            .update(updateData)
            .eq('id', companyId)
            .select()
            .single()

          if (updateError) {
            console.error('Error updating company:', updateError)
            throw updateError;
          }
          
          updatedCompany = companyData
          console.log('Successfully updated company:', updatedCompany);
        } else {
          console.log('No company data to update - all fields were empty');
        }
      } catch (error) {
        console.error('Failed to update company:', error);
        // Don't throw here - we want to continue with the response even if company update fails
      }
    } else {
      console.log('No company info available to update');
    }

    // Return success response with the created user and updated company
    return new NextResponse(JSON.stringify({
      status: 'success',
      message: 'User created successfully',
      user: createdUser,
      company: updatedCompany
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

// Handle GET requests for SSE
export async function GET(request: Request) {
  const supabase = await initSupabaseClient()
  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  }

  try {
    // Parse URL parameters
    const { searchParams } = new URL(request.url)
    const companyName = searchParams.get('companyName')
    const companyId = searchParams.get('companyId')
    const requesterId = searchParams.get('requesterId')
    const role = searchParams.get('role')

    // Validate required parameters
    if (!companyName) {
      throw new Error('Company name is required')
    }
    if (!companyId) {
      throw new Error('Company ID is required')
    }
    if (!requesterId) {
      throw new Error('Requester ID is required')
    }
    if (!role) {
      throw new Error('Role is required')
    }

    // Create a TransformStream for SSE
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()
    const encoder = new TextEncoder()

    // Send initial connection success
    writer.write(encoder.encode('event: ping\ndata: {"status":"connected"}\n\n'))

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

    try {
      // Send initial progress
      writer.write(encoder.encode('event: progress\ndata: {"status":"starting","message":"Starting AI research..."}\n\n'));

      // Make request to AI research API with timeout
      const response = await fetch('https://api-bcbe5a.stack.tryrelevance.com/latest/studios/df49f13b-7f61-4e9d-9e18-1e40c08ec700/trigger_limited', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "f7c3f59e2585-475f-83ff-5992c33b6b89:sk-Y2ZhM2YwNDAtYWQyMC00YTE3LWE3ZDEtZTNjNTAyY2RkY2Zh"
        },
        body: JSON.stringify({
          "params": {
            "company_name": companyName,
            "role": role,
            "company_id": companyId,
            "requester_id": requesterId,
            "app_url": process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
          },
          "project": "f7c3f59e2585-475f-83ff-5992c33b6b89"
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Send progress update
      writer.write(encoder.encode('event: progress\ndata: {"status":"processing","message":"Processing AI response..."}\n\n'));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI API response error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
          url: response.url
        });
        
        let errorMessage = 'Failed to fetch AI research';
        if (response.status === 504) {
          errorMessage = 'AI research request timed out. Please try again.';
        } else if (response.status === 429) {
          errorMessage = 'Too many requests. Please wait a moment and try again.';
        }
        
        throw new Error(`${errorMessage} (Status: ${response.status})`);
      }

      const data: AIResearchResponse = await response.json()
      
      // Log the AI response for debugging
      console.log('AI API response:', data)

      // Check if the AI response indicates a failure
      if (data.status === 'failed') {
        // Extract useful information from the error if possible
        const errorInfo = data.errors?.[0]?.body || 'No results returned'
        if (errorInfo.includes('fetch failed')) {
          // This is an expected error from the callback attempt - we can still process the data
          console.log('Ignoring callback error and processing available data')
        } else {
          throw new Error('AI research failed: ' + errorInfo)
        }
      }
      
      // Extract user info from output
      let userInfo = null;
      if (data.output?.user_position) {
        try {
          const userPosition = JSON.parse(data.output.user_position);
          const [firstName, ...lastNameParts] = userPosition.name.split(' ');
          userInfo = {
            first_name: firstName,
            last_name: lastNameParts.join(' '),
            email: `${firstName.toLowerCase()}.${lastNameParts.join('').toLowerCase()}@example.com`, // This could be improved
            position: userPosition.role,
            company_id: companyId,
            owner_id: requesterId,
            role: 'lead',
            status: 'new'
          };
        } catch (e) {
          console.error('Error parsing user position:', e);
        }
      }

      // If we couldn't get user info from output, try direct response
      if (!userInfo && data.first_name) {
        userInfo = {
          first_name: data.first_name,
          last_name: data.last_name || '',
          email: data.email || '',
          position: data.position || '',
          company_id: companyId,
          owner_id: requesterId,
          role: 'lead',
          status: 'new'
        };
      }

      // Extract company info from the AI response data
      console.log('Raw AI response data:', data);
      const companyInfo = extractCompanyInfo(data);

      // Use extracted user info or throw error
      if (!userInfo) {
        console.error('Invalid AI response:', data)
        throw new Error('AI research returned insufficient contact information')
      }

      // Create the user in our database if we have user info
      let createdUser = null
      if (userInfo) {
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert(userInfo)
          .select()
          .single()

        if (createError) {
          console.error('Error creating user:', createError)
          throw new Error('Failed to create user from AI research')
        }
        createdUser = newUser
      }

      // Update company if we have company info
      let updatedCompany = null
      if (companyInfo) {
        console.log('Updating company with info:', companyInfo);
        
        // Get existing company first
        const { data: existingCompany, error: fetchError } = await supabase
          .from('companies')
          .select('*')
          .eq('id', companyId)
          .single()

        if (fetchError) {
          console.error('Error fetching company:', fetchError)
        } else {
          // Prepare update data
          const updateData: CompanyUpdateData = {};
          
          // Only update fields that have values
          if (companyInfo.website) updateData.website = companyInfo.website;
          if (companyInfo.street_address) updateData.street_address = companyInfo.street_address;
          if (companyInfo.neighborhood) updateData.neighborhood = companyInfo.neighborhood;
          if (companyInfo.city) updateData.city = companyInfo.city;
          if (companyInfo.state) updateData.state = companyInfo.state;
          if (companyInfo.postal_code) updateData.postal_code = companyInfo.postal_code;
          if (companyInfo.country) updateData.country = companyInfo.country;
          if (companyInfo.type) updateData.type = companyInfo.type;
          if (companyInfo.description) updateData.description = companyInfo.description;
          
          // Handle notes specially - always update if we have new notes
          if (companyInfo.notes) {
            updateData.notes = existingCompany.notes
              ? `${existingCompany.notes}\n\nAI Research Update (${new Date().toISOString()}):\n${companyInfo.notes}`
              : `AI Research Update (${new Date().toISOString()}):\n${companyInfo.notes}`;
          }

          // Only update if we have data to update
          if (Object.keys(updateData).length > 0) {
            console.log('Updating company with data:', updateData);
            const { data: companyData, error: updateError } = await supabase
              .from('companies')
              .update(updateData)
              .eq('id', companyId)
              .select()
              .single()

            if (updateError) {
              console.error('Error updating company:', updateError)
            } else {
              updatedCompany = companyData
              console.log('Successfully updated company:', updatedCompany);
            }
          } else {
            console.log('No company data to update');
          }
        }
      }

      // Send the processed results
      const result = {
        status: 'success',
        message: createdUser && updatedCompany 
          ? 'Created new lead and updated company information'
          : createdUser 
          ? 'Created new lead'
          : updatedCompany 
          ? 'Updated company information'
          : 'Research completed',
        user: createdUser,
        company: updatedCompany
      }

      console.log('Sending research results:', result)
      writer.write(encoder.encode(`event: complete\ndata: ${JSON.stringify(result)}\n\n`))

      // Close the stream
      writer.close()

      return new Response(stream.readable, { headers })

    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') {
        throw new Error('AI research request timed out after 2 minutes. The request may be taking longer than usual. Please try again.');
      }
      throw error;
    }

  } catch (error) {
    console.error('Research error:', error)
    
    // Create a new stream for error response
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()
    const encoder = new TextEncoder()

    // Send error message
    const errorResponse = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
    console.log('Sending error response:', errorResponse)
    writer.write(encoder.encode(`event: error\ndata: ${JSON.stringify(errorResponse)}\n\n`))

    // Close the stream
    writer.close()

    return new Response(stream.readable, { headers })
  }
} 