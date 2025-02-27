"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"

type NewCompany = {
  name: string;
  type: string;
  street_address: string;
  neighborhood: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  website: string;
}

export default function NewCompanyPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null)
  const [newCompany, setNewCompany] = useState<Partial<NewCompany>>({
    name: '',
    type: '',
    street_address: '',
    neighborhood: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
    website: '',
  })

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
  }, [router])

  const canCreate = () => {
    return ['agent', 'admin', 'super_admin'].includes(currentUserRole || '')
  }

  const handleCreateCompany = async () => {
    if (!canCreate()) return
    if (!newCompany.name || !newCompany.type) {
      setError('Company name and type are required')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const { data: company, error: createError } = await supabase
        .from('companies')
        .insert({
          name: newCompany.name,
          type: newCompany.type,
          street_address: newCompany.street_address || null,
          neighborhood: newCompany.neighborhood || null,
          city: newCompany.city || null,
          state: newCompany.state || null,
          postal_code: newCompany.postal_code || null,
          country: newCompany.country || null,
          website: newCompany.website || null,
          organization_id: currentOrganizationId
        })
        .select()
        .single()

      if (createError) throw createError

      router.push(`/companies/${company.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create company')
      console.error('Error creating company:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!canCreate()) {
    return (
      <div className="container mx-auto py-10">
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md">
          Only agents and admins can create new companies.
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Create New Company</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Add a new company to your CRM
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
                {error}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Company Name *</Label>
                  <Input
                    id="name"
                    value={newCompany.name || ''}
                    onChange={(e) => setNewCompany(prev => ({ ...prev, name: e.target.value }))}
                    className="mt-1"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    value={newCompany.website || ''}
                    onChange={(e) => setNewCompany(prev => ({ ...prev, website: e.target.value }))}
                    className="mt-1"
                    type="url"
                    placeholder="https://example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="type">Type *</Label>
                  <Select
                    value={newCompany.type || ''}
                    onValueChange={(value: string) => setNewCompany(prev => ({ ...prev, type: value }))}
                  >
                    <SelectTrigger id="type" className="mt-1">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aquatic_center">Aquatic Center</SelectItem>
                      <SelectItem value="big_brother_big_sister">Big Brother, Big Sister</SelectItem>
                      <SelectItem value="churches">Churches</SelectItem>
                      <SelectItem value="community_center">Community Center</SelectItem>
                      <SelectItem value="detox">Detox</SelectItem>
                      <SelectItem value="doctors_office">Doctor&apos;s Office</SelectItem>
                      <SelectItem value="emergency_medical_services">Emergency Medical Services</SelectItem>
                      <SelectItem value="first_responders">First Responders</SelectItem>
                      <SelectItem value="government_health_agencies">Government Health Agencies</SelectItem>
                      <SelectItem value="health_foundations">Health Foundations</SelectItem>
                      <SelectItem value="hospitals">Hospitals</SelectItem>
                      <SelectItem value="insurance">Insurance</SelectItem>
                      <SelectItem value="lawyers_legal_services">Lawyers & Legal Services</SelectItem>
                      <SelectItem value="mental_health">Mental Health</SelectItem>
                      <SelectItem value="mental_health_inpatient">Mental Health Inpatient</SelectItem>
                      <SelectItem value="occupational_health">Occupational Health Providers</SelectItem>
                      <SelectItem value="personal_life_coach">Personal Life Coach</SelectItem>
                      <SelectItem value="recovery_services">Recovery Services</SelectItem>
                      <SelectItem value="rehab_center">Rehab Center</SelectItem>
                      <SelectItem value="resources">Resources</SelectItem>
                      <SelectItem value="rural_churches">Rural Areas Churches</SelectItem>
                      <SelectItem value="rural_community_centers">Rural Areas Community Centers</SelectItem>
                      <SelectItem value="rural_gp">Rural Areas GP</SelectItem>
                      <SelectItem value="rural_ped_care">Rural Areas Ped Care</SelectItem>
                      <SelectItem value="schools">Schools</SelectItem>
                      <SelectItem value="sport_center">Sport Center</SelectItem>
                      <SelectItem value="therapists">Therapists</SelectItem>
                      <SelectItem value="treatment_center">Treatment Center</SelectItem>
                      <SelectItem value="veterans_services">Veterans Services</SelectItem>
                      <SelectItem value="wellness_fitness">Wellness & Fitness Companies</SelectItem>
                      <SelectItem value="ymca">YMCA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="street_address">Street Address</Label>
                  <Input
                    id="street_address"
                    value={newCompany.street_address || ''}
                    onChange={(e) => setNewCompany(prev => ({ ...prev, street_address: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="neighborhood">Neighborhood</Label>
                  <Input
                    id="neighborhood"
                    value={newCompany.neighborhood || ''}
                    onChange={(e) => setNewCompany(prev => ({ ...prev, neighborhood: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={newCompany.city || ''}
                    onChange={(e) => setNewCompany(prev => ({ ...prev, city: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={newCompany.state || ''}
                    onChange={(e) => setNewCompany(prev => ({ ...prev, state: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="postal_code">Postal Code</Label>
                  <Input
                    id="postal_code"
                    value={newCompany.postal_code || ''}
                    onChange={(e) => setNewCompany(prev => ({ ...prev, postal_code: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={newCompany.country || ''}
                    onChange={(e) => setNewCompany(prev => ({ ...prev, country: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-2 mt-4">
              <Button variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button onClick={handleCreateCompany} disabled={loading}>
                {loading ? 'Creating...' : 'Create Company'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 