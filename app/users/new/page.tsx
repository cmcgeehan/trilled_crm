"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"
import { Database } from "@/types/supabase"

type UserRole = 'lead' | 'customer' | 'agent' | 'admin' | 'super_admin'
type UserStatus = 'new' | 'won'

export default function NewUserPage() {
  const router = useRouter()
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
    company_id: "",
    role: "lead" as UserRole,
    status: "new" as UserStatus,
    owner_id: null as string | null,
    notes: "",
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
    loadAgents()
    loadCompanies()
  }, [router])

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

  const loadCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .is('deleted_at', null)
        .order('name')

      if (error) throw error
      setCompanies(data || [])
    } catch (err) {
      console.error('Error loading companies:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      let userId: string;

      // Only create auth users for agents, admins, and super admins
      if (['agent', 'admin', 'super_admin'].includes(formData.role)) {
        // Create auth user with login capabilities
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: generateTempPassword(),
          options: {
            data: {
              first_name: formData.first_name,
              last_name: formData.last_name,
              can_login: true
            }
          }
        })

        if (authError) throw authError
        if (!authData.user) throw new Error('Failed to create auth user')
        
        userId = authData.user.id
        
        // Wait a moment for the trigger to complete
        await new Promise(resolve => setTimeout(resolve, 1000))
      } else {
        // For leads and customers, just create a UUID without auth
        userId = crypto.randomUUID()
        
        // Create new user
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            id: userId,
            first_name: formData.first_name,
            last_name: formData.last_name,
            email: formData.email,
            phone: formData.phone,
            company_id: formData.company_id,
            notes: formData.notes,
            role: formData.role,
            status: formData.role === 'lead' ? 'new' : 'won',
            owner_id: formData.owner_id,
            created_at: new Date().toISOString(),
            organization_id: currentOrganizationId
          })

        if (insertError) throw insertError

        // Create follow-ups immediately after user creation for leads and customers
        if (formData.role === 'lead' || formData.role === 'customer') {
          // Calculate follow-up dates
          const followUpDates = calculateFollowUpDates(new Date(), formData.role)
          
          // Create all follow-ups in a single batch to minimize delay
          const followUpsToCreate = followUpDates.map(date => ({
            date: date.toISOString(),
            type: 'email',
            user_id: userId,
            completed: false,
            next_follow_up_id: null
          }))

          // Insert all follow-ups at once
          const { data: newFollowUps, error: followUpError } = await supabase
            .from('follow_ups')
            .insert(followUpsToCreate)
            .select()

          if (followUpError) throw followUpError
          if (!newFollowUps) throw new Error('Failed to create follow-ups')

          // Update next_follow_up_id links
          for (let i = 0; i < newFollowUps.length - 1; i++) {
            const { error: updateError } = await supabase
              .from('follow_ups')
              .update({ next_follow_up_id: newFollowUps[i + 1].id })
              .eq('id', newFollowUps[i].id)

            if (updateError) throw updateError
          }
        }
      }

      // If we created an auth user, update the database record
      if (['agent', 'admin', 'super_admin'].includes(formData.role)) {
        const { error: updateError } = await supabase
          .from('users')
          .update({
            first_name: formData.first_name,
            last_name: formData.last_name,
            phone: formData.phone,
            company_id: formData.company_id,
            notes: formData.notes,
            role: formData.role,
            status: formData.role === 'lead' ? 'new' : 'won',
            owner_id: formData.owner_id,
            created_at: new Date().toISOString(),
            organization_id: currentOrganizationId
          })
          .eq('id', userId)

        if (updateError) throw updateError
      }

      router.push('/users')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
      console.error('Error creating user:', err)
    } finally {
      setLoading(false)
    }
  }

  // Helper function to generate a temporary password
  const generateTempPassword = () => {
    const length = 12
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
    let password = ''
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length)
      password += charset[randomIndex]
    }
    return password
  }

  // Helper function to calculate follow-up dates based on role
  const calculateFollowUpDates = (createdDate: Date, role: 'lead' | 'customer') => {
    const dates = []
    const day = 24 * 60 * 60 * 1000 // milliseconds in a day

    // Different intervals based on role
    const intervals = role === 'lead'
      ? [1, 2, 4, 7, 10, 14, 28] // Lead follow-up sequence
      : [14, 28, 42, 56, 70, 90, 120, 150, 180] // Customer follow-up sequence

    for (const interval of intervals) {
      dates.push(new Date(createdDate.getTime() + interval * day))
    }
    
    return dates
  }

  if (!currentUserRole || !['admin', 'super_admin'].includes(currentUserRole)) {
    return (
      <div className="container mx-auto py-10">
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md">
          Only admins can create new users.
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
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="john@example.com"
                    required
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
                      <SelectItem value="agent">Agent</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="company">Company</Label>
                  <Select
                    value={formData.company_id}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, company_id: value }))}
                  >
                    <SelectTrigger id="company" className="mt-1">
                      <SelectValue placeholder="Select company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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