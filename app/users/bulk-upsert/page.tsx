"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { calculateFollowUpDates } from "@/lib/utils"

type UserRole = 'lead' | 'customer' | 'agent'
type AllUserRole = UserRole | 'admin' | 'super_admin'

type ValidationError = {
  row: number;
  user: string;
  errors: string[];
}

type UserStatus = 'needs_response' | 'new' | 'follow_up' | 'won' | 'lost'

type UserData = {
  id?: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  position?: string | null;
  role: UserRole;
  status: UserStatus;
  company_id?: string | null;
  owner_id?: string | null;
  organization_id?: string | null;
  notes?: string | null;
}

const FIELDS = [
  { name: 'first_name', description: 'First name (required)' },
  { name: 'last_name', description: 'Last name (required)' },
  { name: 'email', description: 'Email address (required)' },
  { name: 'phone', description: 'Phone number (optional)' },
  { name: 'company_name', description: 'Company name (optional) - will be matched against existing companies' },
  { name: 'position', description: 'Position at company (optional)' },
  { name: 'role', description: 'User role (optional) - defaults to "lead" if not specified' },
  { name: 'owner_email', description: 'Email of the assigned owner (optional) - must be an existing agent/admin' },
  { name: 'notes', description: 'Additional notes (optional)' },
]

const VALID_ROLES = ['lead', 'customer', 'agent'] as const

export default function BulkUpsertPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [success, setSuccess] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<AllUserRole | null>(null)
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null)

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          console.log('No session found, redirecting to login')
          router.replace('/login')
          return
        }

        // Get current user's role and organization
        const { data: userData } = await supabase
          .from('users')
          .select('role, organization_id')
          .eq('id', session.user.id)
          .single()
        
        if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
          console.log('User does not have permission to access this page')
          router.replace('/users')
          return
        }

        setCurrentUserRole(userData.role as AllUserRole)
        setCurrentOrganizationId(userData.organization_id)
        setLoading(false)
      } catch (error) {
        console.error('Error checking access:', error)
        router.replace('/users')
      }
    }

    checkAccess()
  }, [router])

  const validateRow = async (
    data: Record<string, string | null>
  ): Promise<string[]> => {
    const errors: string[] = []
    
    // Required fields
    if (!data.first_name) {
      errors.push('First name is required')
    }
    if (!data.last_name) {
      errors.push('Last name is required')
    }
    if (!data.email) {
      errors.push('Email is required')
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push('Invalid email format')
    }

    // Validate role if provided
    if (data.role) {
      const role = data.role as string
      // Check if trying to create/update admin or super_admin
      if (role === 'admin' || role === 'super_admin') {
        errors.push('Cannot create or update admin or super admin users through bulk upsert')
      } else if (!VALID_ROLES.includes(role as UserRole)) {
        errors.push(`Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`)
      }
    }

    // Super admins can create users in any org, admins only in their org
    if (currentUserRole === 'admin' && data.role === 'super_admin') {
      errors.push('Admins cannot create super admin users')
    }

    // Validate company name if provided
    if (data.company_name) {
      let query = supabase
        .from('companies')
        .select('id')
        .eq('name', data.company_name)
        .is('deleted_at', null)

      // If admin, restrict to their organization's companies
      if (currentUserRole === 'admin' && currentOrganizationId) {
        query = query.eq('organization_id', currentOrganizationId)
      }

      const { data: company, error: companyError } = await query.single()

      if (companyError || !company) {
        errors.push(`Company not found: ${data.company_name}`)
      }
    }

    // Validate owner email if provided
    if (data.owner_email) {
      let query = supabase
        .from('users')
        .select('id, role')
        .eq('email', data.owner_email)
        .in('role', ['agent', 'admin', 'super_admin'])

      // If admin, restrict to their organization's users
      if (currentUserRole === 'admin' && currentOrganizationId) {
        query = query.eq('organization_id', currentOrganizationId)
      }

      const { data: owner, error: ownerError } = await query.single()

      if (ownerError || !owner) {
        errors.push(`Owner not found or not an agent/admin: ${data.owner_email}`)
      }
    }

    // Validate phone number format if provided
    if (data.phone && !/^\+?[\d\s-()]+$/.test(data.phone)) {
      errors.push('Invalid phone number format')
    }

    return errors
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setError(null)
      setValidationErrors([])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError('Please select a CSV file')
      return
    }

    setLoading(true)
    setError(null)
    setValidationErrors([])
    setSuccess(false)
    
    try {
      const text = await file.text()
      const rows = text.split('\n')
      const headers = rows[0].split(',').map(h => h.trim())
      
      // Validate headers
      const requiredFields = ['first_name', 'last_name', 'email']
      const missingFields = requiredFields.filter(field => !headers.includes(field))
      if (missingFields.length > 0) {
        throw new Error(`Missing required columns: ${missingFields.join(', ')}`)
      }

      // Validate all rows first
      const validationErrors: ValidationError[] = []
      const usersToProcess: Record<string, string | null>[] = []

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i].split(',').map(cell => cell.trim())
        if (row.length === 0 || (row.length === 1 && !row[0])) continue // Skip empty rows
        
        if (row.length !== headers.length) {
          validationErrors.push({
            row: i,
            user: row[headers.indexOf('email')] || `Row ${i}`,
            errors: [`Invalid number of columns. Expected ${headers.length}, got ${row.length}`]
          })
          continue
        }
        
        const userData: Record<string, string | null> = {}
        headers.forEach((header, index) => {
          userData[header] = row[index] || null
        })

        // Validate the row
        const rowErrors = await validateRow(userData)
        if (rowErrors.length > 0) {
          validationErrors.push({
            row: i,
            user: `${userData.first_name || ''} ${userData.last_name || ''} (${userData.email || `Row ${i}`})`.trim(),
            errors: rowErrors
          })
        } else {
          usersToProcess.push(userData)
        }
      }

      // Check for duplicate emails in the CSV
      const emails = usersToProcess.map(u => u.email?.toLowerCase()).filter((email): email is string => email !== null && email !== undefined)
      const duplicates = emails.filter((email, index) => 
        emails.indexOf(email) !== index
      )
      if (duplicates.length > 0) {
        validationErrors.push({
          row: 0,
          user: 'Multiple rows',
          errors: [`Duplicate email addresses found: ${[...new Set(duplicates)].join(', ')}`]
        })
      }

      // If there are any validation errors, stop here
      if (validationErrors.length > 0) {
        setValidationErrors(validationErrors)
        return
      }

      // Process all valid users
      // First, get all existing users in one query
      const userEmails = usersToProcess.map(u => u.email?.toLowerCase()).filter((email): email is string => email !== null)
      const { data: existingUsers, error: lookupError } = await supabase
        .from('users')
        .select('id, email')
        .in('email', userEmails)

      if (lookupError) {
        console.error('Error looking up users:', lookupError)
        throw new Error(`Error looking up users: ${lookupError.message}`)
      }

      // Create a map of existing users by email for quick lookup
      const existingUserMap = new Map(
        existingUsers?.map(user => [user.email.toLowerCase(), user]) || []
      )

      // Create maps for companies and owners to avoid repeated lookups
      const companyNames = new Set(usersToProcess.map(u => u.company_name).filter((name): name is string => name !== null))
      const ownerEmails = new Set(usersToProcess.map(u => u.owner_email).filter((email): email is string => email !== null))

      // Batch lookup companies
      let companiesQuery = supabase
        .from('companies')
        .select('id, name')
        .in('name', Array.from(companyNames))
        .is('deleted_at', null)

      if (currentUserRole === 'admin' && currentOrganizationId) {
        companiesQuery = companiesQuery.eq('organization_id', currentOrganizationId)
      }

      const { data: companies } = await companiesQuery
      const companyMap = new Map(
        companies?.map(company => [company.name, company.id]) || []
      )

      // Batch lookup owners
      let ownersQuery = supabase
        .from('users')
        .select('id, email')
        .in('email', Array.from(ownerEmails))
        .in('role', ['agent', 'admin', 'super_admin'])

      if (currentUserRole === 'admin' && currentOrganizationId) {
        ownersQuery = ownersQuery.eq('organization_id', currentOrganizationId)
      }

      const { data: owners } = await ownersQuery
      const ownerMap = new Map(
        owners?.map(owner => [owner.email.toLowerCase(), owner.id]) || []
      )

      // Prepare users for update/insert
      const usersToUpdate: UserData[] = []
      const usersToInsert: UserData[] = []

      for (const userData of usersToProcess) {
        if (!userData.email) continue

        const processedUser: UserData = {
          first_name: userData.first_name || '',
          last_name: userData.last_name || '',
          email: userData.email,
          phone: userData.phone || null,
          position: userData.position || null,
          role: (userData.role as UserRole) || 'lead',
          status: (userData.status as UserStatus) || 'new',
          organization_id: currentOrganizationId,
          notes: userData.notes || null
        }

        // Set company_id if company_name exists and was found
        if (userData.company_name) {
          const companyId = companyMap.get(userData.company_name)
          if (companyId) {
            processedUser.company_id = companyId
          }
        }

        // Set owner_id if owner_email exists and was found
        if (userData.owner_email) {
          const ownerId = ownerMap.get(userData.owner_email.toLowerCase())
          if (ownerId) {
            processedUser.owner_id = ownerId
          }
        }

        const existingUser = existingUserMap.get(userData.email.toLowerCase())
        if (existingUser) {
          usersToUpdate.push({
            ...processedUser,
            id: existingUser.id
          })
        } else {
          usersToInsert.push(processedUser)
        }
      }

      // Process updates in batches of 50
      for (let i = 0; i < usersToUpdate.length; i += 50) {
        const batch = usersToUpdate.slice(i, i + 50)
        const { error: updateError } = await supabase
          .from('users')
          .upsert(batch)

        if (updateError) throw updateError
      }

      // Process inserts in batches of 50
      for (let i = 0; i < usersToInsert.length; i += 50) {
        const batch = usersToInsert.slice(i, i + 50)
        const { data: newUsers, error: insertError } = await supabase
          .from('users')
          .insert(batch)
          .select('id, role')

        if (insertError) throw insertError

        // Create follow-up sequences for new leads and customers
        if (newUsers) {
          for (const newUser of newUsers as { id: string; role: UserRole }[]) {
            if (['lead', 'customer'].includes(newUser.role)) {
              const followUpDates = calculateFollowUpDates(new Date(), newUser.role as 'lead' | 'customer')
              
              let previousFollowUpId: string | null = null
              for (const date of followUpDates) {
                const { data: followUp, error: followUpError } = await supabase
                  .from('follow_ups')
                  .insert({
                    date: date.toISOString(),
                    type: 'email',
                    user_id: newUser.id,
                    completed: false,
                    next_follow_up_id: null
                  })
                  .select()
                  .single()

                if (followUpError) throw followUpError
                if (!followUp) throw new Error('Failed to create follow-up')

                if (previousFollowUpId) {
                  await supabase
                    .from('follow_ups')
                    .update({ next_follow_up_id: followUp.id })
                    .eq('id', previousFollowUpId)
                }

                previousFollowUpId = followUp.id
              }
            }
          }
        }
      }

      setSuccess(true)
      setTimeout(() => {
        router.push('/users')
      }, 2000)
    } catch (err) {
      console.error('Error processing CSV:', err)
      setError(err instanceof Error ? err.message : 'Error processing CSV file')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading...</p>
      </div>
    )
  }

  if (!currentUserRole || !['admin', 'super_admin'].includes(currentUserRole)) {
    return null // The useEffect will handle the redirect
  }

  return (
    <div className="container mx-auto py-10">
      <Card>
        <CardHeader>
          <CardTitle>Bulk Upsert Users</CardTitle>
          <CardDescription>
            Upload a CSV file to create or update multiple users at once.
            The first row should contain the column headers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Available Fields</h3>
              <ul className="list-disc pl-5 space-y-2">
                {FIELDS.map(field => (
                  <li key={field.name} className="text-sm text-gray-600">
                    <span className="font-medium">{field.name}</span>: {field.description}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <h3 className="text-lg font-medium mb-2">Valid User Roles</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-gray-600">
                  {VALID_ROLES.map(role => (
                    <div key={role} className="p-2 bg-gray-50 rounded">
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-md file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100"
                />
              </div>

              {error && (
                <div className="text-sm text-red-600 p-4 bg-red-50 rounded-md">
                  {error}
                </div>
              )}

              {validationErrors.length > 0 && (
                <div className="text-sm text-red-600 p-4 bg-red-50 rounded-md space-y-2">
                  <p className="font-medium">Please fix the following errors:</p>
                  {validationErrors.map((error, index) => (
                    <div key={index} className="ml-4">
                      <p className="font-medium">{error.user} (Row {error.row}):</p>
                      <ul className="list-disc ml-4">
                        {error.errors.map((err, errIndex) => (
                          <li key={errIndex}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {success && (
                <div className="text-sm text-green-600 p-4 bg-green-50 rounded-md">
                  Users successfully uploaded! Redirecting...
                </div>
              )}

              <Button 
                type="submit" 
                disabled={!file || loading}
                className="w-full"
              >
                {loading ? 'Processing...' : 'Upload and Process'}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 