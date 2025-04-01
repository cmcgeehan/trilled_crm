"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import { Database } from "@/types/supabase"
import { CompanyCombobox } from "@/components/ui/company-combobox"
import { OwnerCombobox } from "@/components/ui/owner-combobox"

type UserRole = 'lead' | 'customer' | 'agent' | 'admin' | 'super_admin'

type FormData = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  role: 'lead' | 'customer';
  status: 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';
  owner_id: string | null;
  notes: string;
  lead_type: 'referral_partner' | 'potential_customer' | null;
  linkedin: string;
  company_id: number | null;
  referral_company_id: number | null;
  lead_source: 'google_ads' | 'organic' | 'referral' | 'other' | null;
}

const initialFormData: FormData = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  position: "",
  role: "lead",
  status: "new",
  owner_id: null,
  notes: "",
  lead_type: null,
  linkedin: "",
  company_id: null,
  referral_company_id: null,
  lead_source: null,
}

function NewUserForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agents, setAgents] = useState<{ id: string, email: string | null, first_name: string | null, role: UserRole }[]>([])
  const [companies, setCompanies] = useState<Database['public']['Tables']['companies']['Row'][]>([])
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)

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
        const specificCompany = allCompanies?.find(company => company.id === parseInt(companyId))
        
        if (specificCompany) {
          // Filter out the specific company from the rest of the list
          const otherCompanies = allCompanies?.filter(company => company.id !== parseInt(companyId)) || []
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
          company_id: companyId ? parseInt(companyId) : null
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

    try {
      const response = await fetch('/api/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to create user')
      }

      const data = await response.json()
      router.push(`/users/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleCompanyChange = (value: string | null) => {
    setFormData(prev => ({
      ...prev,
      company_id: value ? parseInt(value) : null
    }))
  }

  const handleReferralCompanyChange = (value: string | null) => {
    setFormData(prev => ({
      ...prev,
      referral_company_id: value ? parseInt(value) : null
    }))
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
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">New User</h1>
        
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
              {/* Show LinkedIn and Position fields only for referral partners */}
              {formData.lead_type === 'referral_partner' && (
                <>
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
                </>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="role">Role *</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, role: value as 'lead' | 'customer' }))}
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
              {formData.role === 'lead' && (
                <div className="space-y-2">
                  <Label htmlFor="lead_type">Lead Type</Label>
                  <Select
                    value={formData.lead_type || ""}
                    onValueChange={(value: 'referral_partner' | 'potential_customer' | "") => 
                      setFormData(prev => ({ ...prev, lead_type: value || null }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select lead type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="potential_customer">Potential Customer</SelectItem>
                      <SelectItem value="referral_partner">Referral Partner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {/* Show Company field for referral partners */}
              {formData.lead_type === 'referral_partner' && (
                <div>
                  <Label htmlFor="company">Company</Label>
                  <div className="mt-1">
                    <CompanyCombobox
                      companies={companies}
                      value={formData.company_id?.toString() || null}
                      onChange={handleCompanyChange}
                    />
                  </div>
                </div>
              )}
              {/* Show Referral Company and Lead Source fields for potential customers */}
              {formData.lead_type === 'potential_customer' && (
                <>
                  <div>
                    <Label htmlFor="referral_company">Referral Company</Label>
                    <div className="mt-1">
                      <CompanyCombobox
                        companies={companies}
                        value={formData.referral_company_id?.toString() || null}
                        onChange={handleReferralCompanyChange}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="lead_source">Lead Source</Label>
                    <Select
                      value={formData.lead_source || ""}
                      onValueChange={(value: 'google_ads' | 'organic' | 'referral' | 'other' | "") => 
                        setFormData(prev => ({ ...prev, lead_source: value || null }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select lead source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="google_ads">Google Ads</SelectItem>
                        <SelectItem value="organic">Organic</SelectItem>
                        <SelectItem value="referral">Referral</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div>
                <Label htmlFor="owner">Owner</Label>
                <OwnerCombobox
                  owners={agents}
                  value={formData.owner_id}
                  onChange={(value) => setFormData(prev => ({ ...prev, owner_id: value }))}
                />
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
      </div>
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