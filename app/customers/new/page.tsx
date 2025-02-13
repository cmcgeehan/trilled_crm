"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import { Database } from "@/types/supabase"

type NewUserRole = 'lead' | 'customer'
type UserStatus = Database['public']['Tables']['users']['Row']['status']
type Agent = {
  id: string
  email: string | null
}

export default function NewCustomerPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company: "",
    notes: "",
    role: "lead" as NewUserRole,
    status: "new" as UserStatus,
    owner_id: undefined as string | undefined
  })

  useEffect(() => {
    loadAgents()
  }, [])

  const loadAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email')
        .eq('role', 'agent')
        .is('deleted_at', null)
      
      if (error) throw error
      setAgents(data || [])
    } catch (err) {
      console.error('Error loading agents:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Insert the new customer
      const { data: newCustomer, error: customerError } = await supabase
        .from('users')
        .insert([formData])
        .select()
        .single()

      if (customerError) throw customerError
      if (!newCustomer) throw new Error('Failed to create customer')

      // Generate follow-up dates based on role
      const dates = calculateFollowUpDates(new Date(), formData.role)
      
      // Create follow-ups for the new customer with linked list structure
      let previousFollowUpId: string | undefined
      for (const date of dates) {
        const { data: newFollowUp, error: followUpError } = await supabase
          .from('follow_ups')
          .insert({
            user_id: newCustomer.id,
            date: date.toISOString(),
            type: 'email',
            completed: false
          })
          .select()
          .single()

        if (followUpError) throw followUpError
        if (!newFollowUp) throw new Error('Failed to create follow-up')

        // If we have a previous follow-up, update its next_follow_up_id
        if (previousFollowUpId) {
          const { error: updateError } = await supabase
            .from('follow_ups')
            .update({ next_follow_up_id: newFollowUp.id })
            .eq('id', previousFollowUpId)

          if (updateError) throw updateError
        }

        previousFollowUpId = newFollowUp.id
      }

      router.push('/customers')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create customer')
      console.error('Error creating customer:', err)
    } finally {
      setLoading(false)
    }
  }

  // Helper function to calculate follow-up dates based on role
  const calculateFollowUpDates = (createdDate: Date, role: NewUserRole) => {
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (name: string, value: string) => {
    if (name === 'owner_id' && value === 'unassigned') {
      setFormData(prev => ({ ...prev, owner_id: undefined }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Add New Customer</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 text-red-500 p-4 rounded-md mb-4">
            {error}
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="first_name">First Name *</Label>
            <Input
              id="first_name"
              name="first_name"
              value={formData.first_name}
              onChange={handleChange}
              placeholder="John"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name">Last Name *</Label>
            <Input
              id="last_name"
              name="last_name"
              value={formData.last_name}
              onChange={handleChange}
              placeholder="Doe"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="john@example.com"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={handleChange}
            placeholder="123-456-7890"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="company">Company</Label>
          <Input
            id="company"
            name="company"
            value={formData.company}
            onChange={handleChange}
            placeholder="Acme Inc."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="role">Role *</Label>
          <Select
            value={formData.role}
            onValueChange={(value) => handleSelectChange('role', value)}
          >
            <SelectTrigger id="role">
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="owner">Owner</Label>
          <Select
            value={formData.owner_id || 'unassigned'}
            onValueChange={(value) => handleSelectChange('owner_id', value)}
          >
            <SelectTrigger id="owner">
              <SelectValue placeholder="Select owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.email || 'Unassigned'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Any additional information..."
            rows={4}
          />
        </div>

        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Customer'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
} 