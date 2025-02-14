"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"
import { Database } from "@/types/supabase"
import { use } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertTriangle } from "lucide-react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { formatCompanyType } from "@/lib/utils"

type Company = Database['public']['Tables']['companies']['Row'] & {
  street_address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  status?: string;
  lost_reason?: string | null;
  other_reason?: string | null;
  type: CompanyType;
}

type CompanyType = 
  | 'aquatic_center'
  | 'big_brother_big_sister'
  | 'churches'
  | 'community_center'
  | 'detox'
  | 'doctors_office'
  | 'emergency_medical_services'
  | 'first_responders'
  | 'government_health_agencies'
  | 'health_foundations'
  | 'hospitals'
  | 'insurance'
  | 'lawyers_legal_services'
  | 'mental_health'
  | 'mental_health_inpatient'
  | 'occupational_health'
  | 'personal_life_coach'
  | 'recovery_services'
  | 'rehab_center'
  | 'resources'
  | 'rural_churches'
  | 'rural_community_centers'
  | 'rural_gp'
  | 'rural_ped_care'
  | 'schools'
  | 'sport_center'
  | 'therapists'
  | 'treatment_center'
  | 'veterans_services'
  | 'wellness_fitness'
  | 'ymca'

type User = Database['public']['Tables']['users']['Row']

const lostReasons = [
  { id: "budget", label: "Budget constraints" },
  { id: "competitor", label: "Chose a competitor" },
  { id: "timing", label: "Bad timing" },
  { id: "needs", label: "Needs not met" },
  { id: "other", label: "Other" },
]

export default function CompanyDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const id = use(params).id
  const router = useRouter()
  const [company, setCompany] = useState<Company | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editedCompany, setEditedCompany] = useState<Company | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isMarkingAsLost, setIsMarkingAsLost] = useState(false)
  const [lostReason, setLostReason] = useState<string | null>(null)
  const [otherReason, setOtherReason] = useState<string>("")

  useEffect(() => {
    const loadCompanyAndUsers = async () => {
      try {
        setLoading(true)
        
        // Load company details
        let query = supabase
          .from('companies')
          .select('*')
          .eq('id', id)

        // Apply organization filter for non-super admins
        if (currentUserRole !== 'super_admin') {
          query = query.eq('organization_id', currentOrganizationId)
        }

        const { data: companyData, error: companyError } = await query.single()

        if (companyError) throw companyError
        if (!companyData) throw new Error('Company not found')

        setCompany(companyData as Company)
        setEditedCompany(companyData as Company)

        // Load associated users
        let usersQuery = supabase
          .from('users')
          .select('*')
          .eq('company_id', id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })

        // Apply organization filter for non-super admins
        if (currentUserRole !== 'super_admin') {
          usersQuery = usersQuery.eq('organization_id', currentOrganizationId)
        }

        const { data: usersData, error: usersError } = await usersQuery

        if (usersError) throw usersError
        setUsers(usersData || [])

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load company')
        console.error('Error loading company:', err)
      } finally {
        setLoading(false)
      }
    }

    if (currentUserRole !== null) {
      loadCompanyAndUsers()
    }
  }, [id, currentUserRole, currentOrganizationId])

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

  const handleSaveCompany = async () => {
    if (!editedCompany) return

    try {
      setLoading(true)
      let query = supabase
        .from('companies')
        .update({
          name: editedCompany.name,
          type: editedCompany.type as CompanyType,
          street_address: editedCompany.street_address,
          neighborhood: editedCompany.neighborhood,
          city: editedCompany.city,
          state: editedCompany.state,
          postal_code: editedCompany.postal_code,
          country: editedCompany.country,
        })
        .eq('id', id)

      // Apply organization filter for non-super admins
      if (currentUserRole !== 'super_admin') {
        query = query.eq('organization_id', currentOrganizationId)
      }

      const { error: updateError } = await query

      if (updateError) throw updateError

      setCompany(editedCompany)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update company')
      console.error('Error updating company:', err)
    } finally {
      setLoading(false)
    }
  }

  const canEdit = () => {
    return ['admin', 'super_admin'].includes(currentUserRole || '')
  }

  const handleDelete = async () => {
    if (!company) return

    try {
      setIsDeleting(true)
      setDeleteError(null)

      const { error: deleteError } = await supabase
        .from('companies')
        .update({
          deleted_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (deleteError) throw deleteError

      setCompany(null)
      setEditedCompany(null)
      setUsers([])
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete company')
      console.error('Error deleting company:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleMarkAsLost = async () => {
    if (!company) return

    try {
      setLoading(true)
      const updates: Database['public']['Tables']['companies']['Update'] = {
        lost_reason: lostReason || undefined,
        other_reason: lostReason === "other" ? otherReason : undefined,
      }

      const { error: markError } = await supabase
        .from('companies')
        .update(updates)
        .eq('id', id)

      if (markError) throw markError

      setCompany(prev => prev ? {
        ...prev,
        lost_reason: lostReason || null,
        other_reason: lostReason === "other" ? otherReason : null,
      } : null)
    } catch (err) {
      console.error('Error marking company as lost:', err)
    } finally {
      setLoading(false)
      setIsMarkingAsLost(false)
    }
  }

  const handleTypeChange = (value: string) => {
    setEditedCompany(prev => prev ? { ...prev, type: value as CompanyType } : null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading company details...</p>
      </div>
    )
  }

  if (error || !company || !editedCompany) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-500">Error: {error || 'Company not found'}</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10 space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{company.name}</h1>
          <div className="mt-2">
            <Badge variant="secondary">
              {company.type ? formatCompanyType(company.type) : 'No Type Set'}
            </Badge>
          </div>
        </div>
        <div className="flex gap-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-red-600 border-red-600 hover:bg-red-50" disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete Company'}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Are you sure you want to delete this company?</DialogTitle>
              </DialogHeader>
              <p className="text-muted-foreground">
                This action cannot be undone. This will permanently delete the company.
              </p>
              {deleteError && (
                <p className="text-red-500">{deleteError}</p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDeleting(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {company?.status !== 'lost' && (
            <Dialog open={isMarkingAsLost} onOpenChange={setIsMarkingAsLost}>
              <DialogTrigger asChild>
                <Button variant="outline" className="text-red-600 border-red-600 hover:bg-red-50" onClick={() => setIsMarkingAsLost(true)}>
                  <AlertTriangle className="mr-2 h-4 w-4" /> Mark as Lost
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Mark Company as Lost</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                  <Label htmlFor="lost-reason" className="mb-2 block">
                    Select a reason:
                  </Label>
                  <RadioGroup id="lost-reason" value={lostReason || ''} onValueChange={setLostReason}>
                    {lostReasons.map((reason) => (
                      <div key={reason.id} className="flex items-center space-x-2">
                        <RadioGroupItem value={reason.id} id={reason.id} />
                        <Label htmlFor={reason.id}>{reason.label}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                  {lostReason === "other" && (
                    <Textarea
                      placeholder="Please specify the reason"
                      value={otherReason}
                      onChange={(e) => setOtherReason(e.target.value)}
                      className="mt-2"
                    />
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsMarkingAsLost(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleMarkAsLost}>
                    Mark as Lost
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {!canEdit() && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md mb-4">
                Only admins can edit company details.
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Company Name</Label>
                  <Input
                    id="name"
                    value={editedCompany.name || ''}
                    onChange={(e) => setEditedCompany(prev => ({ ...prev!, name: e.target.value }))}
                    className="mt-1"
                    disabled={!canEdit()}
                  />
                </div>
                <div>
                  <Label htmlFor="type">Type</Label>
                  <Select
                    value={editedCompany.type || ''}
                    onValueChange={handleTypeChange}
                    disabled={!canEdit()}
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
                    value={editedCompany.street_address || ''}
                    onChange={(e) => setEditedCompany(prev => ({ ...prev!, street_address: e.target.value }))}
                    className="mt-1"
                    disabled={!canEdit()}
                  />
                </div>
                <div>
                  <Label htmlFor="neighborhood">Neighborhood</Label>
                  <Input
                    id="neighborhood"
                    value={editedCompany.neighborhood || ''}
                    onChange={(e) => setEditedCompany(prev => ({ ...prev!, neighborhood: e.target.value }))}
                    className="mt-1"
                    disabled={!canEdit()}
                  />
                </div>
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={editedCompany.city || ''}
                    onChange={(e) => setEditedCompany(prev => ({ ...prev!, city: e.target.value }))}
                    className="mt-1"
                    disabled={!canEdit()}
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={editedCompany.state || ''}
                    onChange={(e) => setEditedCompany(prev => ({ ...prev!, state: e.target.value }))}
                    className="mt-1"
                    disabled={!canEdit()}
                  />
                </div>
                <div>
                  <Label htmlFor="postal_code">Postal Code</Label>
                  <Input
                    id="postal_code"
                    value={editedCompany.postal_code || ''}
                    onChange={(e) => setEditedCompany(prev => ({ ...prev!, postal_code: e.target.value }))}
                    className="mt-1"
                    disabled={!canEdit()}
                  />
                </div>
                <div>
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={editedCompany.country || ''}
                    onChange={(e) => setEditedCompany(prev => ({ ...prev!, country: e.target.value }))}
                    className="mt-1"
                    disabled={!canEdit()}
                  />
                </div>
              </div>
            </div>
            {canEdit() && (
              <div className="flex justify-end space-x-2 mt-4">
                <Button variant="outline" onClick={() => setEditedCompany(company)}>
                  Reset Changes
                </Button>
                <Button onClick={handleSaveCompany} disabled={loading}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Associated Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">
                    No users associated with this company
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      {[user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unnamed User'}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.position || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        onClick={() => router.push(`/users/${user.id}`)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
} 