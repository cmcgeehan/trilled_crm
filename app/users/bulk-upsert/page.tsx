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
  email?: string | null;
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
  { name: 'email', description: 'Email address (optional)' },
  { name: 'phone', description: 'Phone number (optional)' },
  { name: 'company_name', description: 'Company name (optional) - will be matched against existing companies' },
  { name: 'position', description: 'Position at company (optional)' },
  { name: 'role', description: 'User role (optional) - defaults to "lead" if not specified' },
  { name: 'owner_email', description: 'Email of the assigned owner (optional) - must be an existing agent/admin' },
  { name: 'notes', description: 'Additional notes (optional)' },
]

const VALID_ROLES = ['lead', 'customer', 'agent'] as const

type ValidationResult = {
  errors: Map<number, string[]>;
  companyMap: Map<string, string>;
  ownerMap: Map<string, string>;
  validOwnerEmails: Set<string>;
}

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

  const validateRows = async (
    rows: Record<string, string | null>[]
  ): Promise<ValidationResult> => {
    const errors = new Map<number, string[]>()
    
    // Collect all unique company names and owner emails for batch validation
    const companyNames = new Set<string>()
    const ownerEmails = new Set<string>()
    
    rows.forEach(data => {
      if (data.company_name) companyNames.add(data.company_name.trim())
      if (data.owner_email) ownerEmails.add(data.owner_email)
    })

    // Use API route to check and create companies
    const companiesResponse = await fetch('/api/companies/check-and-create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        companyNames: Array.from(companyNames),
        organizationId: currentOrganizationId
      })
    })

    if (!companiesResponse.ok) {
      throw new Error('Failed to check and create companies')
    }

    const companies = await companiesResponse.json() as Array<{ id: string; name: string }>
    console.log('Companies from API:', companies)
    const companyMap = new Map(companies.map(company => [company.name.toLowerCase().trim(), company.id]))
    console.log('Company map entries:', Array.from(companyMap.entries()))

    // Log company mapping process
    rows.forEach((data, index) => {
      if (data.company_name) {
        console.log('Processing company mapping:', {
          rowIndex: index,
          originalCompanyName: data.company_name,
          normalizedCompanyName: data.company_name.toLowerCase().trim(),
          foundInMap: companyMap.has(data.company_name.toLowerCase().trim()),
          mappedId: companyMap.get(data.company_name.toLowerCase().trim())
        })
      }
    })

    // Use API route to check owners
    const ownersResponse = await fetch('/api/users/check-owners', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        emails: Array.from(ownerEmails),
        organizationId: currentOrganizationId
      })
    })

    if (!ownersResponse.ok) {
      throw new Error('Failed to check owners')
    }

    const owners = await ownersResponse.json() as Array<{ id: string; email: string; role: string }>
    const ownerMap = new Map(owners.map(owner => [owner.email.toLowerCase(), owner.id]))
    const validOwnerEmails = new Set(owners.map(o => o.email))

    // Validate each row
    rows.forEach((data, index) => {
      const rowErrors: string[] = []
      
      // Required fields
      if (!data.first_name) {
        rowErrors.push('First name is required')
      }
      if (!data.last_name) {
        rowErrors.push('Last name is required')
      }
      
      // Validate email format if provided
      if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        rowErrors.push('Invalid email format')
      }

      // Validate role if provided
      if (data.role) {
        const role = data.role as string
        if (role === 'super_admin') {
          rowErrors.push('Cannot create super admin users through bulk upsert')
        } else if (role === 'admin') {
          if (currentUserRole !== 'super_admin') {
            rowErrors.push('Only super admins can create admin users')
          }
        } else if (role === 'agent') {
          if (!['super_admin', 'admin'].includes(currentUserRole || '')) {
            rowErrors.push('Only super admins and admins can create agent users')
          }
        } else if (!VALID_ROLES.includes(role as UserRole)) {
          rowErrors.push(`Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`)
        }
      }

      // Validate organization access
      if (currentUserRole !== 'super_admin' && data.organization_id !== currentOrganizationId) {
        rowErrors.push('Cannot create users in different organizations')
      }

      // Validate owner if provided
      if (data.owner_email && !validOwnerEmails.has(data.owner_email)) {
        rowErrors.push(`Owner not found or not an agent/admin: ${data.owner_email}`)
      }

      // Validate phone number format if provided
      if (data.phone && !/^\+?[\d\s-()]+$/.test(data.phone)) {
        rowErrors.push('Invalid phone number format')
      }

      if (rowErrors.length > 0) {
        errors.set(index, rowErrors)
      }
    })

    return { 
      errors, 
      companyMap, 
      ownerMap,
      validOwnerEmails 
    }
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
      
      // Split into lines, handling both \r\n and \n
      const lines = text.split(/\r?\n/)
      
      // Parse CSV with proper quote handling
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = []
        let inQuotes = false
        let currentValue = ''
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              // Handle escaped quotes
              currentValue += '"'
              i++
            } else {
              // Toggle quotes mode
              inQuotes = !inQuotes
            }
          } else if (char === ',' && !inQuotes) {
            // End of field
            result.push(currentValue.trim())
            currentValue = ''
          } else {
            currentValue += char
          }
        }
        
        // Push the last field
        result.push(currentValue.trim())
        return result
      }

      const rows = lines.map(line => parseCSVLine(line))
      const headers = rows[0]
      
      // Validate headers
      const requiredFields = ['first_name', 'last_name']
      const missingFields = requiredFields.filter(field => !headers.includes(field))
      if (missingFields.length > 0) {
        throw new Error(`Missing required columns: ${missingFields.join(', ')}`)
      }

      // Parse rows into objects
      const usersToValidate: Record<string, string | null>[] = []
      const columnErrors: ValidationError[] = []

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        // Skip empty rows or rows with all empty values
        if (row.length === 0 || row.every(cell => !cell)) continue
        
        if (row.length !== headers.length) {
          columnErrors.push({
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
        usersToValidate.push(userData)
      }

      // If there are column errors, stop here
      if (columnErrors.length > 0) {
        setValidationErrors(columnErrors)
        return
      }

      // Batch validate all rows
      const { errors, companyMap, ownerMap, validOwnerEmails } = await validateRows(usersToValidate)
      if (errors.size > 0) {
        const validationErrors: ValidationError[] = Array.from(errors.entries()).map(([index, rowErrors]) => ({
          row: index + 1,
          user: `${usersToValidate[index].first_name || ''} ${usersToValidate[index].last_name || ''} (${usersToValidate[index].email || `Row ${index + 1}`})`.trim(),
          errors: rowErrors
        }))
        setValidationErrors(validationErrors)
        return
      }

      console.log('Parsed users to validate:', usersToValidate)

      // Process all valid users
      // First, get all existing users in one query
      const userEmails = usersToValidate.map(u => u.email?.toLowerCase()).filter((email): email is string => email !== null)
      
      // Use API route to check existing users
      const existingUsersResponse = await fetch('/api/users/check-existing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emails: userEmails })
      })

      if (!existingUsersResponse.ok) {
        throw new Error('Failed to check existing users')
      }

      const existingUsers = (await existingUsersResponse.json()) as Array<{ id: string; email: string }>

      // Create a map of existing users by email for quick lookup
      const existingUserMap = new Map(
        existingUsers.map(user => [user.email.toLowerCase(), user])
      )

      // Prepare users for update/insert
      const usersToUpdate: UserData[] = []
      const usersToInsert: UserData[] = []

      for (const userData of usersToValidate) {
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
          const normalizedCompanyName = userData.company_name.toLowerCase().trim()
          console.log('Looking up company:', {
            original: userData.company_name,
            normalized: normalizedCompanyName,
            found: companyMap.get(normalizedCompanyName)
          })
          const companyId = companyMap.get(normalizedCompanyName)
          if (companyId) {
            processedUser.company_id = companyId
          } else {
            console.log('Company not found in map')
          }
        }

        // Set owner_id if owner_email exists and was found
        if (userData.owner_email) {
          const ownerId = validOwnerEmails.has(userData.owner_email) ? ownerMap.get(userData.owner_email.toLowerCase()) : null
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

      console.log('Validation results:', {
        errors: Array.from(errors.entries()),
        companyMapSize: companyMap.size,
        ownerMapSize: ownerMap.size
      })

      // Process updates in batches of 50
      for (let i = 0; i < usersToUpdate.length; i += 50) {
        const batch = usersToUpdate.slice(i, i + 50)
        const updatePromises = batch.map(user => 
          fetch('/api/users/update', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(user)
          }).then(res => {
            if (!res.ok) throw new Error('Failed to update user')
            return res.json()
          })
        )

        const updatedUsers = await Promise.all(updatePromises)

        // Create follow-up sequences for updated leads and customers
        for (const updatedUser of updatedUsers) {
          if (['lead', 'customer'].includes(updatedUser.role)) {
            const followUpDates = calculateFollowUpDates(new Date(), updatedUser.role as 'lead' | 'customer')
            
            // Create follow-ups via API route
            await fetch('/api/users/follow-ups', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                followUps: followUpDates.map(date => ({
                  date: date.toISOString(),
                  type: 'email',
                  user_id: updatedUser.id,
                  completed: false,
                  next_follow_up_id: null
                }))
              })
            }).then(res => {
              if (!res.ok) throw new Error('Failed to create follow-ups')
              return res.json()
            })
          }
        }
      }

      console.log('Users to process:', {
        toUpdate: usersToUpdate,
        toInsert: usersToInsert
      })

      // Process inserts in batches of 50
      for (let i = 0; i < usersToInsert.length; i += 50) {
        const batch = usersToInsert.slice(i, i + 50)
        console.log('Processing insert batch:', batch)
        const insertPromises = batch.map(user => {
          console.log('Preparing to create user:', {
            userData: user,
            hasCompanyId: !!user.company_id,
            hasOwnerId: !!user.owner_id,
            hasOrgId: !!user.organization_id
          })
          return fetch('/api/users/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              ...user,
              created_at: new Date().toISOString()
            })
          }).then(async res => {
            if (!res.ok) {
              const errorText = await res.text()
              console.error('Create user error:', {
                status: res.status,
                statusText: res.statusText,
                errorText
              })
              throw new Error(`Failed to create user: ${errorText}`)
            }
            return res.json()
          })
        })

        try {
          const newUsers = await Promise.all(insertPromises)
          console.log('Created users:', newUsers)

          // Create follow-up sequences for new leads and customers
          for (const newUser of newUsers) {
            if (['lead', 'customer'].includes(newUser.role)) {
              const followUpDates = calculateFollowUpDates(new Date(), newUser.role as 'lead' | 'customer')
              
              // Create follow-ups via API route
              await fetch('/api/users/follow-ups', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  followUps: followUpDates.map(date => ({
                    date: date.toISOString(),
                    type: 'email',
                    user_id: newUser.id,
                    completed: false,
                    next_follow_up_id: null
                  }))
                })
              }).then(res => {
                if (!res.ok) throw new Error('Failed to create follow-ups')
                return res.json()
              })
            }
          }

          setSuccess(true)
          setTimeout(() => {
            router.push('/users')
          }, 2000)
        } catch (err) {
          console.error('Error processing insert batch:', err)
          setError(err instanceof Error ? err.message : 'Error processing insert batch')
        }
      }
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