import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { companyNames, organizationId } = await request.json()
    
    const supabase = createRouteHandlerClient({ cookies })
    
    // Verify user is authenticated and has appropriate role
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { data: currentUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single()

    if (!currentUser || !['admin', 'super_admin'].includes(currentUser.role)) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    // Get existing companies
    let companiesQuery = supabase
      .from('companies')
      .select('id, name')
      .in('name', companyNames)
      .is('deleted_at', null)

    if (currentUser.role === 'admin' && organizationId) {
      companiesQuery = companiesQuery.eq('organization_id', organizationId)
    }

    const { data: existingCompanies, error: fetchError } = await companiesQuery
    if (fetchError) {
      console.error('Error fetching companies:', fetchError)
      return new NextResponse('Internal Server Error', { status: 500 })
    }

    const existingCompanyNames = new Set(existingCompanies?.map(c => c.name) || [])
    const companiesToCreate = companyNames.filter((name: string) => !existingCompanyNames.has(name))

    // Create missing companies
    if (companiesToCreate.length > 0) {
      const { error: createError } = await supabase
        .from('companies')
        .insert(companiesToCreate.map((name: string) => ({
          name,
          type: 'schools',
          organization_id: organizationId
        })))

      if (createError) {
        console.error('Error creating companies:', createError)
        return new NextResponse('Internal Server Error', { status: 500 })
      }

      // Fetch all companies again to get the newly created ones
      const { data: allCompanies, error: refetchError } = await companiesQuery
      if (refetchError) {
        console.error('Error refetching companies:', refetchError)
        return new NextResponse('Internal Server Error', { status: 500 })
      }

      return NextResponse.json(allCompanies)
    }

    return NextResponse.json(existingCompanies)
  } catch (error) {
    console.error('Error in check-and-create route:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
} 