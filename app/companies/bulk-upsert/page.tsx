"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

type UserRole = 'lead' | 'customer' | 'agent' | 'admin' | 'super_admin'

const FIELDS = [
  { name: 'name', description: 'Company name (required)' },
  { name: 'type', description: 'Company type (required) - must match one of the predefined types' },
  { name: 'street_address', description: 'Street address (optional)' },
  { name: 'neighborhood', description: 'Neighborhood (optional)' },
  { name: 'city', description: 'City (optional)' },
  { name: 'state', description: 'State (optional)' },
  { name: 'postal_code', description: 'Postal code (optional)' },
  { name: 'country', description: 'Country (optional)' },
]

const VALID_COMPANY_TYPES = [
  'aquatic_center',
  'big_brother_big_sister',
  'churches',
  'community_center',
  'detox',
  'doctors_office',
  'emergency_medical_services',
  'first_responders',
  'government_health_agencies',
  'health_foundations',
  'hospitals',
  'insurance',
  'lawyers_legal_services',
  'mental_health',
  'mental_health_inpatient',
  'occupational_health',
  'personal_life_coach',
  'recovery_services',
  'rehab_center',
  'resources',
  'rural_churches',
  'rural_community_centers',
  'rural_gp',
  'rural_ped_care',
  'schools',
  'sport_center',
  'therapists',
  'treatment_center',
  'veterans_services',
  'wellness_fitness',
  'ymca'
]

type ValidationError = {
  row: number;
  company: string;
  errors: string[];
}

export default function BulkUpsertPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [success, setSuccess] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null)
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
          router.replace('/companies')
          return
        }

        setCurrentUserRole(userData.role as UserRole)
        setCurrentOrganizationId(userData.organization_id)
        setLoading(false)
      } catch (error) {
        console.error('Error checking access:', error)
        router.replace('/companies')
      }
    }

    checkAccess()
  }, [router])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setError(null)
    }
  }

  const validateRow = async (data: Record<string, string | null>): Promise<string[]> => {
    const errors: string[] = []
    
    // Required fields
    if (!data.name) {
      errors.push('Name is required')
    }
    
    return errors
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
      const requiredFields = ['name', 'type']
      const missingFields = requiredFields.filter(field => !headers.includes(field))
      if (missingFields.length > 0) {
        throw new Error(`Missing required columns: ${missingFields.join(', ')}`)
      }

      // Parse CSV data
      const companiesToProcess = rows.slice(1).map(row => {
        const data: Record<string, string | null> = {}
        row.split(',').forEach((cell, index) => {
          data[headers[index]] = cell.trim() || null
        })
        return data
      })

      // Validate all rows first
      const validationErrors: ValidationError[] = []
      
      for (let i = 0; i < companiesToProcess.length; i++) {
        const companyData = companiesToProcess[i]
        const rowErrors = await validateRow(companyData)
        if (rowErrors.length > 0) {
          validationErrors.push({
            row: i + 1,
            company: companyData.name || `Row ${i + 1}`,
            errors: rowErrors
          })
        }
      }

      // Check for duplicate company names in the CSV
      const companyNames = companiesToProcess
        .map(c => c.name)
        .filter((name): name is string => typeof name === 'string')
      const duplicates = companyNames.filter((name, index) => 
        companyNames.indexOf(name) !== index
      )
      if (duplicates.length > 0) {
        validationErrors.push({
          row: 0,
          company: 'Multiple rows',
          errors: [`Duplicate company names found: ${[...new Set(duplicates)].join(', ')}`]
        })
      }

      // If there are any validation errors, stop here
      if (validationErrors.length > 0) {
        setValidationErrors(validationErrors)
        return
      }

      // Process all valid companies
      for (const companyData of companiesToProcess) {
        if (!companyData.name) continue // Skip if no name

        // Check if company exists
        let query = supabase
          .from('companies')
          .select('id')
          .eq('name', companyData.name)
          .is('deleted_at', null)

        // If admin, restrict to their organization's companies
        if (currentUserRole === 'admin' && currentOrganizationId) {
          query = query.eq('organization_id', currentOrganizationId)
        }

        const { data: existingCompany } = await query.single()

        if (existingCompany) {
          // Update existing company
          const { error: updateError } = await supabase
            .from('companies')
            .update(companyData)
            .eq('id', existingCompany.id)

          if (updateError) throw updateError
        } else {
          // Create new company
          const { error: createError } = await supabase
            .from('companies')
            .insert([{
              ...companyData,
              organization_id: currentOrganizationId
            }])

          if (createError) throw createError
        }
      }

      setSuccess(true)
      setTimeout(() => {
        router.push('/companies')
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
          <CardTitle>Bulk Upsert Companies</CardTitle>
          <CardDescription>
            Upload a CSV file to create or update multiple companies at once.
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
                <h3 className="text-lg font-medium mb-2">Valid Company Types</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-gray-600">
                  {VALID_COMPANY_TYPES.map(type => (
                    <div key={type} className="p-2 bg-gray-50 rounded">
                      {type.split('_').map(word => 
                        word.charAt(0).toUpperCase() + word.slice(1)
                      ).join(' ')}
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
                      <p className="font-medium">{error.company} (Row {error.row}):</p>
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
                  Companies successfully uploaded! Redirecting...
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