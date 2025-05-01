"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/supabase'

export default function NewCustomerPage() {
  const router = useRouter()
  const [supabase] = useState(() => createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ))
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
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

        // Get current user's organization
        const { data: userData } = await supabase
          .from('users')
          .select('organization_id')
          .eq('id', session.user.id)
          .single()
        
        if (userData) {
          setCurrentOrganizationId(userData.organization_id)
        }
      } catch (error) {
        console.error('Error checking session:', error)
        setError('Failed to initialize page. Please try again.')
      } finally {
        setInitializing(false)
      }
    }

    checkSession()
  }, [router, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Create the user via API route
      const response = await fetch('/api/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          role: 'customer',
          created_at: new Date().toISOString(),
          organization_id: currentOrganizationId
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create customer')
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  if (initializing) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Create New Customer</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Add a new customer to your CRM
        </p>
      </div>

      <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl md:col-span-2">
        <form onSubmit={handleSubmit} className="px-4 py-6 sm:p-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md mb-6">
              {error}
            </div>
          )}
          
          <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2">
            <div>
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                id="first_name"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
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
                onChange={handleChange}
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
                onChange={handleChange}
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
                onChange={handleChange}
                placeholder="123-456-7890"
                className="mt-1"
              />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Any additional information..."
                rows={4}
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 mt-6">
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
              {loading ? 'Creating...' : 'Create Customer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
} 