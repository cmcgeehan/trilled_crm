"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"
import { Database } from "@/types/supabase"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"

declare global {
  interface Window {
    activeEventSource: EventSource | null;
  }
}

type Company = Database['public']['Tables']['companies']['Row'] & {
  street_address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  website?: string | null;
  status?: string;
  type: CompanyType;
  notes?: string | null;
  description?: string | null;
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

export default function CompanyDetailsPage() {
  const params = useParams()
  const id = params.id as string
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
  const [isResearching, setIsResearching] = useState(false)

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
          website: editedCompany.website,
          street_address: editedCompany.street_address,
          neighborhood: editedCompany.neighborhood,
          city: editedCompany.city,
          state: editedCompany.state,
          postal_code: editedCompany.postal_code,
          country: editedCompany.country,
          notes: editedCompany.notes,
          description: editedCompany.description,
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
    return ['agent', 'admin', 'super_admin'].includes(currentUserRole || '')
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

  const handleTypeChange = (value: string) => {
    setEditedCompany(prev => prev ? { ...prev, type: value as CompanyType } : null)
  }

  const handleAIResearch = async () => {
    if (!company) return;

    try {
      setIsResearching(true);

      // Get current user's session
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('No active session found')
      }

      // Create EventSource for research endpoint
      const params = new URLSearchParams({
        companyName: company.name || '',
        companyId: company.id,
        requesterId: session.user.id,
        role: currentUserRole || 'agent'
      });

      let retryCount = 0;
      const maxRetries = 3;
      const retryDelay = 2000; // 2 seconds

      const connectEventSource = () => {
        // Close any existing connection
        if (window.activeEventSource) {
          window.activeEventSource.close();
        }

        // Create EventSource with authorization header
        const eventSource = new EventSource(`/api/companies/research?${params.toString()}`, {
          withCredentials: true
        });

        // Store the active EventSource globally so we can close it if needed
        window.activeEventSource = eventSource;

        // Set up event handlers
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('Received message:', data);
          } catch (err) {
            console.error('Error parsing message:', err);
          }
        };

        eventSource.addEventListener('ping', (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            console.log('Received ping:', data);
          } catch (err) {
            console.error('Error parsing ping:', err);
          }
        });

        eventSource.addEventListener('complete', (event: MessageEvent) => {
          try {
            const researchData = JSON.parse(event.data);
            console.log('Research complete:', researchData);
            
            if (researchData.status === 'success') {
              let message = 'Research completed successfully.';
              
              // Update users list if a new user was created
              if (researchData.user) {
                setUsers(prev => [researchData.user, ...prev]);
                message = 'Successfully created new lead from AI research';
              }

              // Update company data if it was modified
              if (researchData.company) {
                setCompany(researchData.company);
                setEditedCompany(researchData.company);
                if (!researchData.user) {
                  message = 'Successfully updated company information';
                }
              }

              // Show success message
              alert(message);
            } else {
              console.error('Invalid research response:', researchData);
              throw new Error(researchData.error || 'Research failed to return expected data');
            }
          } catch (err) {
            console.error('Error handling complete event:', err);
            alert('Error processing research results: ' + (err instanceof Error ? err.message : 'Unknown error'));
          } finally {
            eventSource.close();
            setIsResearching(false);
          }
        });

        eventSource.addEventListener('error', async (event: MessageEvent) => {
          console.error('Research error event:', event);
          let errorMessage = 'Unknown error occurred';
          
          try {
            if (event.data) {
              const errorData = JSON.parse(event.data);
              errorMessage = errorData.error || errorMessage;
            }
          } catch (e) {
            console.error('Error parsing error data:', e);
          }

          // Close the current connection
          eventSource.close();

          // If we haven't exceeded max retries and it's a timeout error, try again
          if (retryCount < maxRetries && (errorMessage.includes('timeout') || !event.data)) {
            console.log(`Retrying connection (${retryCount + 1}/${maxRetries})...`);
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            connectEventSource();
          } else {
            alert('Failed to perform AI research: ' + errorMessage);
            setIsResearching(false);
          }
        });

        eventSource.onerror = (error) => {
          console.error('EventSource connection error:', error);
          eventSource.close();
        };
      };

      // Initial connection
      connectEventSource();

      // Cleanup function
      return () => {
        if (window.activeEventSource) {
          console.log('Cleaning up EventSource connection');
          window.activeEventSource.close();
          setIsResearching(false);
        }
      };

    } catch (err) {
      console.error('Error setting up AI research:', err);
      alert('Failed to start AI research: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setIsResearching(false);
    }
  };

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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{company.name}</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Company Details
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            onClick={handleAIResearch}
            disabled={isResearching}
            className="bg-brand-darkBlue hover:bg-brand-darkBlue/90 text-white"
          >
            {isResearching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Researching...
              </>
            ) : (
              'Request AI Research'
            )}
          </Button>
          {canEdit() && (
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
                  This action cannot be undone. This will permanently delete the company and remove all associations.
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
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {!canEdit() && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md mb-4">
                Only agents and admins can edit company details.
              </div>
            )}

            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Basic Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Company Name</Label>
                  <Input
                    id="name"
                    value={editedCompany?.name || ''}
                    onChange={(e) => setEditedCompany(prev => ({ ...prev!, name: e.target.value }))}
                    className="mt-1"
                    disabled={!canEdit()}
                  />
                </div>
                <div>
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    value={editedCompany?.website || ''}
                    onChange={(e) => setEditedCompany(prev => ({ ...prev!, website: e.target.value }))}
                    className="mt-1"
                    type="url"
                    placeholder="https://example.com"
                    disabled={!canEdit()}
                  />
                </div>
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

            {/* Address Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Address Information</h3>
              <div className="grid grid-cols-2 gap-4">
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

            {/* Additional Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Additional Details</h3>
              <div>
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  value={editedCompany?.description || ''}
                  onChange={(e) => setEditedCompany(prev => ({ ...prev!, description: e.target.value }))}
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Company description..."
                  disabled={!canEdit()}
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  value={editedCompany?.notes || ''}
                  onChange={(e) => setEditedCompany(prev => ({ ...prev!, notes: e.target.value }))}
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Add notes about this company..."
                  disabled={!canEdit()}
                />
              </div>
            </div>

            {canEdit() && (
              <div className="flex justify-end space-x-2 mt-6">
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