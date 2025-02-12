"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { calculateFollowUpDates } from "@/lib/utils"

type UserRole = 'lead' | 'customer' | 'agent' | 'admin' | 'super_admin'

type ValidationError = {
  row: number;
  user: string;
  errors: string[];
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

const VALID_ROLES = ['lead', 'customer', 'agent', 'admin', 'super_admin'] as const

export default function BulkUpsertPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [success, setSuccess] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null)

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          console.log('No session found, redirecting to login')
          router.replace('/login')
          return
        }

        // Get current user's role
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', session.user.id)
          .single()
        
        if (!userData || !['admin', 'super_admin'].includes(userData.role)) {
          console.log('User does not have permission to access this page')
          router.replace('/users')
          return
        }

        setCurrentUserRole(userData.role as UserRole)
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
    if (data.role && !VALID_ROLES.includes(data.role as UserRole)) {
      errors.push(`Invalid role: ${data.role}. Must be one of: ${VALID_ROLES.join(', ')}`)
    }

    // Validate company name if provided
    if (data.company_name) {
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .eq('name', data.company_name)
        .is('deleted_at', null)
        .single()

      if (companyError || !company) {
        errors.push(`Company not found: ${data.company_name}`)
      }
    }

    // Validate owner email if provided
    if (data.owner_email) {
      const { data: owner, error: ownerError } = await supabase
        .from('users')
        .select('id, role')
        .eq('email', data.owner_email)
        .in('role', ['agent', 'admin', 'super_admin'])
        .single()

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
      for (const userData of usersToProcess) {
        // Look up company ID if company_name is provided
        if (userData.company_name) {
          const { data: companyData } = await supabase
            .from('companies')
            .select('id')
            .eq('name', userData.company_name)
            .is('deleted_at', null)
            .single()
          
          if (companyData) {
            userData.company_id = companyData.id
          }
          delete userData.company_name
        }

        // Look up owner ID if owner_email is provided
        if (userData.owner_email) {
          const { data: ownerData } = await supabase
            .from('users')
            .select('id')
            .eq('email', userData.owner_email)
            .in('role', ['agent', 'admin', 'super_admin'])
            .single()
          
          if (ownerData) {
            userData.owner_id = ownerData.id
          }
          delete userData.owner_email
        }

        // Set defaults
        userData.role = userData.role || 'lead'
        userData.status = userData.status || 'new'

        // Check if user exists
        if (userData.email) {
          const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', userData.email)
            .single()

          if (existingUser) {
            // Update existing user
            const { error: updateError } = await supabase
              .from('users')
              .update(userData)
              .eq('id', existingUser.id)

            if (updateError) throw updateError
          } else {
            // Create new user
            const { data: newUser, error: createError } = await supabase
              .from('users')
              .insert([userData])
              .select()
              .single()

            if (createError) throw createError

            // Create follow-up sequence for leads and customers
            if (newUser && ['lead', 'customer'].includes(userData.role)) {
              const followUpDates = calculateFollowUpDates(new Date(), userData.role as 'lead' | 'customer')
              
              let previousFollowUpId: string | null = null
              for (const date of followUpDates) {
                const { data: followUp, error: followUpError } = await supabase
                  .from('follow_ups')
                  .insert({
                    date: date.toISOString(),
                    type: 'email',
                    user_id: newUser.id,
                    title: `${userData.role} follow-up`,
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