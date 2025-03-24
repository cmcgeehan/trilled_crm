"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { Database } from "@/types/supabase"

// Force dynamic rendering
export const dynamic = 'force-dynamic'

type Customer = Database['public']['Tables']['users']['Row'] & {
  name?: string;
  company?: string | null;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const loadCustomers = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          companies (
            name
          )
        `)
        .in('role', ['lead', 'customer'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading customers:', error)
        return
      }

      const formattedCustomers: Customer[] = (data || []).map(customer => ({
        ...customer,
        name: customer.first_name && customer.last_name ? `${customer.first_name} ${customer.last_name}` : customer.first_name || customer.last_name || undefined,
        company: customer.companies?.name || null
      }))

      setCustomers(formattedCustomers)
    } catch (err) {
      console.error('Error loading customers:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCustomers()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading customers...</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Customers</h1>
        <Button onClick={() => router.push('/customers/new')}>
          Add Customer
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {customers.map((customer) => (
          <div
            key={customer.id}
            className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => router.push(`/customers/${customer.id}`)}
          >
            <h2 className="text-lg font-semibold">{customer.name || 'Unnamed Customer'}</h2>
            {customer.company && (
              <p className="text-gray-600">{customer.company}</p>
            )}
            <p className="text-gray-500 mt-2">
              {customer.email || customer.phone || 'No contact information'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}