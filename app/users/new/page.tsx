"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"
import { Database } from "@/types/supabase"
import { CompanyCombobox } from "@/components/ui/company-combobox"

type UserRole = 'lead' | 'customer' | 'agent' | 'admin' | 'super_admin'
type UserStatus = 'new' | 'won'

function NewUserForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agents, setAgents] = useState<{ id: string, email: string | null, first_name: string | null, role: UserRole }[]>([])
  const [companies, setCompanies] = useState<Database['public']['Tables']['companies']['Row'][]>([])
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    linkedin: "",
    position: "",
    company_id: searchParams?.get('company') || null as string | null,
    role: "lead" as UserRole,
    status: "new" as UserStatus,
    owner_id: null as string | null,
    notes: "",
  })

  const loadCompanies = useCallback(async () => {
    try {
      console.log('Loading companies...')
      const companyId = searchParams?.get('company')
      console.log('Company ID from URL:', companyId)

      // Load all companies first
      const { data: allCompanies, error } = await supabase
        .from('companies')
        .select('*')
        .is('deleted_at', null)
        .order('name')
        .limit(1000)

      if (error) throw error

      // If we have a specific company ID, ensure it's in the list and at the top
      if (companyId) {
        // Find the specific company in the loaded companies
        const specificCompany = allCompanies?.find(company => company.id === companyId)
        
        if (specificCompany) {
          // Filter out the specific company from the rest of the list
          const otherCompanies = allCompanies?.filter(company => company.id !== companyId) || []
          // Set the companies with the specific company first
          setCompanies([specificCompany, ...otherCompanies])
        } else {
          // If the specific company wasn't in the first 1000, load it separately
          const { data: companyData, error: companyError } = await supabase
            .from('companies')
            .select('*')
            .eq('id', companyId)
            .single()

          if (companyError) {
            console.error('Error loading specific company:', companyError)
          } else if (companyData) {
            console.log('Loaded specific company:', companyData)
            // Set the companies with the specific company first
            setCompanies([companyData, ...(allCompanies || [])])
          }
        }

        // Set the company ID in form data
        console.log('Setting company ID in form:', companyId)
        setFormData(prev => ({
          ...prev,
          company_id: companyId
        }))
      } else {
        // If no specific company, just set all companies
        setCompanies(allCompanies || [])
      }
    } catch (err) {
      console.error('Error loading companies:', err)
    }
  }, [searchParams])

  useEffect(() => {
    const checkSession = async () => {
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
        
        if (userData) {
          setCurrentUserRole(userData.role)
          setCurrentOrganizationId(userData.organization_id)
        }
      } catch (error) {
        console.error('Error checking session:', error)
        router.replace('/login')
      }
    }

    checkSession()
    loadAgents()
    loadCompanies()
  }, [router, loadCompanies])

  const loadAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, role, first_name, email')
        .not('role', 'in', '("lead","customer")')
        .order('role')
      
      if (error) throw error
      
      if (data) {
        const formattedAgents = data.map(user => ({
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          role: user.role
        }))
        setAgents(formattedAgents)
      }
    } catch (err) {
      console.error('Error loading agents:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validate that either email, phone, or linkedin is provided
    if (!formData.email && !formData.phone && !formData.linkedin) {
      setError('At least one contact method (email, phone, or LinkedIn) is required')
      setLoading(false)
      return
    }

    try {
      let userId: string;

      // For agents, admins, and super admins, create auth account first
      if (['agent', 'admin', 'super_admin'].includes(formData.role)) {
        // Create auth user with login capabilities using invitation via API route
        const response = await fetch('/api/users/invite', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: formData.email,
            userData: {
              first_name: formData.first_name,
              last_name: formData.last_name,
              role: formData.role,
              can_login: true
            }
          })
        })

        const responseData = await response.json()
        if (!response.ok) {
          throw new Error(responseData.error || 'Failed to invite user')
        }

        if (!responseData.user) {
          throw new Error('Failed to create auth user')
        }
        userId = responseData.user.id
      } else {
        // For leads and customers, generate a UUID
        userId = crypto.randomUUID()
      }

      // Create the user in public.users via API route
      const createResponse = await fetch('/api/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: userId,
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          phone: formData.phone,
          linkedin: formData.linkedin,
          position: formData.position,
          company_id: formData.company_id || null,
          notes: formData.notes,
          role: formData.role,
          status: formData.role === 'lead' ? 'new' : null,
          owner_id: formData.owner_id,
          created_at: new Date().toISOString(),
          organization_id: currentOrganizationId
        })
      })

      if (!createResponse.ok) {
        const error = await createResponse.json()
        throw new Error(error.error || 'Failed to create user')
      }

      // Follow-ups are now created by the API, so we can just redirect
      router.push('/users')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
      console.error('Error creating user:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!currentUserRole) {
    return (
      <div className="container mx-auto py-10">
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md">
          Please log in to create users.
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Create New User</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Add a new user to your CRM
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
                {error}
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="first_name">First Name *</Label>
                  <Input
                    id="first_name"
                    name="first_name"
                    value={formData.first_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                    placeholder="John"
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="last_name">Last Name *</Label>
                  <Input
                    id="last_name"
                    name="last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                    placeholder="Doe"
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="john@example.com"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="123-456-7890"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="linkedin">LinkedIn</Label>
                  <Input
                    id="linkedin"
                    name="linkedin"
                    type="url"
                    value={formData.linkedin}
                    onChange={(e) => setFormData(prev => ({ ...prev, linkedin: e.target.value }))}
                    placeholder="https://linkedin.com/in/username"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="position">Position</Label>
                  <Input
                    id="position"
                    name="position"
                    value={formData.position}
                    onChange={(e) => setFormData(prev => ({ ...prev, position: e.target.value }))}
                    placeholder="Software Engineer"
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="role">Role *</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, role: value as UserRole }))}
                  >
                    <SelectTrigger id="role" className="mt-1">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="customer">Customer</SelectItem>
                      {(currentUserRole === 'super_admin' || currentUserRole === 'admin') && (
                        <SelectItem value="agent">Agent</SelectItem>
                      )}
                      {currentUserRole === 'super_admin' && (
                        <SelectItem value="admin">Admin</SelectItem>
                      )}
                      {currentUserRole === 'super_admin' && (
                        <SelectItem value="super_admin">Super Admin</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="company">Company</Label>
                  <div className="mt-1">
                    <CompanyCombobox
                      companies={companies}
                      value={formData.company_id}
                      onChange={(value) => {
                        console.log('Company selected:', value)
                        setFormData(prev => ({ ...prev, company_id: value }))
                      }}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="owner">Owner</Label>
                  <Select
                    value={formData.owner_id || 'unassigned'}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, owner_id: value === 'unassigned' ? null : value }))}
                  >
                    <SelectTrigger id="owner" className="mt-1">
                      <SelectValue placeholder="Select owner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.first_name || 'Agent'} ({agent.email || `User ${agent.id}`})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Any additional information..."
                    rows={4}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Create User'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function NewUserPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewUserForm />
    </Suspense>
  )
}