import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Ensure environment variables exist
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing environment variables for Supabase')
}

// Create a Supabase client with the service role key
const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey,
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
  access_token: supabaseServiceKey,
  refresh_token: ''
})

// Define allowed methods
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Add type definition after other imports
type CompanyUpdateData = {
  website?: string;
  street_address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  type?: string;
  notes?: string;
}

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
    const body = await request.json()
    console.log('Received company update request:', body)
    
    const { 
      companyId,
      website,
      street_address,
      neighborhood,
      city,
      state,
      postal_code,
      country,
      type,
      notes
    } = body

    if (!companyId) {
      throw new Error('Company ID is required')
    }

    // Get existing company data
    const { data: existingCompany, error: fetchError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single()

    if (fetchError) {
      console.error('Error fetching company:', fetchError)
      throw new Error('Failed to fetch company')
    }

    // Prepare update data, only including fields that were provided
    const updateData: CompanyUpdateData = {}
    if (website !== undefined) updateData.website = website
    if (street_address !== undefined) updateData.street_address = street_address
    if (neighborhood !== undefined) updateData.neighborhood = neighborhood
    if (city !== undefined) updateData.city = city
    if (state !== undefined) updateData.state = state
    if (postal_code !== undefined) updateData.postal_code = postal_code
    if (country !== undefined) updateData.country = country
    if (type !== undefined) updateData.type = type
    if (notes !== undefined) {
      // If notes already exist, append the new notes
      updateData.notes = existingCompany.notes 
        ? `${existingCompany.notes}\n\nAI Research Update (${new Date().toISOString()}):\n${notes}`
        : `AI Research Update (${new Date().toISOString()}):\n${notes}`
    }

    // Only update if there are changes
    if (Object.keys(updateData).length > 0) {
      const { data: updatedCompany, error: updateError } = await supabase
        .from('companies')
        .update(updateData)
        .eq('id', companyId)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating company:', updateError)
        throw new Error('Failed to update company')
      }

      return new NextResponse(JSON.stringify({
        status: 'success',
        message: 'Company updated successfully',
        company: updatedCompany
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      })
    }

    return new NextResponse(JSON.stringify({
      status: 'success',
      message: 'No updates required',
      company: existingCompany
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    })

  } catch (error) {
    console.error('Error in company update:', error)
    return new NextResponse(
      JSON.stringify({ 
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to update company'
      }),
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