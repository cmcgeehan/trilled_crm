"use client"

import { useState, useEffect, useRef, useCallback, use } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Play, Send, Phone, Calendar, ChevronLeft, ChevronRight, Check } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { format } from "date-fns"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { supabase } from "@/lib/supabase" 
import { Database } from "@/types/supabase"
import { calculateFollowUpDates } from "@/lib/utils"

type UserRole = Database['public']['Tables']['users']['Row']['role']
type FollowUpType = 'email' | 'sms' | 'call' | 'meeting' | 'tour'

type UserStatus = 'new' | 'needs_response' | 'awaiting_response' | 'follow_up' | 'won' | 'lost'

type Customer = Database['public']['Tables']['users']['Row'] & {
  status: UserStatus;
  company_id: string | null;
  notes: string | null;
  companies?: {
    id: string;
    name: string;
  } | null;
}

type Agent = {
  id: string;
  email: string | null;
  first_name: string | null;
}

type FollowUp = Omit<Database['public']['Tables']['follow_ups']['Row'], 'type'> & {
  type: FollowUpType | null;
}

type Case = {
  id: number
  status: string
  createdAt: string
  type: string
  interactions: Interaction[]
}

type Interaction = {
  type: string
  date: string
  content: string
  sender: 'customer' | 'agent'
  duration?: string
  recordingUrl?: string
  agentName?: string
}

const lostReasons = [
  { id: "budget", label: "Budget constraints" },
  { id: "competitor", label: "Chose a competitor" },
  { id: "timing", label: "Bad timing" },
  { id: "needs", label: "Needs not met" },
  { id: "other", label: "Other" },
]

const followUpTypes = [
  { value: "email" as const, label: "Email" },
  { value: "sms" as const, label: "SMS" },
  { value: "call" as const, label: "Call" },
  { value: "meeting" as const, label: "Meeting" },
  { value: "tour" as const, label: "Tour" },
] as const

// Get the expected sequence based on role
const getExpectedSequence = (role: 'lead' | 'customer') => {
  return role === 'lead'
    ? [1, 2, 4, 7, 10, 14, 28]
    : [14, 28, 42, 56, 70, 90, 120, 150, 180]
}

const getCustomerDisplayName = (customer: Customer | null) => {
  if (!customer) return 'User Details'
  return [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Unnamed Customer'
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = use(params).id
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState("cases")
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | React.ReactNode | null>(null)
  const [activeCase, setActiveCase] = useState<Case | null>(null)
  const [cases, setCases] = useState<Case[]>([])
  const [responseChannel, setResponseChannel] = useState("internal")
  const [responseMessage, setResponseMessage] = useState("")
  const [editedCustomer, setEditedCustomer] = useState<Customer | null>(null)
  const [isMarkingAsLost, setIsMarkingAsLost] = useState(false)
  const [lostReason, setLostReason] = useState("")
  const [otherReason, setOtherReason] = useState("")
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUp | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [isUpdatingFollowUps, setIsUpdatingFollowUps] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null)
  const router = useRouter()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [companies, setCompanies] = useState<Database['public']['Tables']['companies']['Row'][]>([])

  const loadCompanies = useCallback(async () => {
    try {
      console.log('Starting loadCompanies function...')
      
      // Get all active companies
      const { data: activeCompanies, error: companiesError } = await supabase
        .from('companies')
        .select('*')
        .is('deleted_at', null)
        .order('name');
      
      console.log('Companies query result:', { activeCompanies, companiesError })
      
      if (companiesError) {
        console.error('Error loading companies:', companiesError);
        return;
      }

      setCompanies(activeCompanies || []);
    } catch (err) {
      console.error('Error in loadCompanies:', err);
    }
  }, []);

  const loadFollowUps = useCallback(async () => {
    try {
      const { data: allFollowUps, error } = await supabase
        .from('follow_ups')
        .select('*')
        .eq('user_id', id)
        .is('deleted_at', null)
        .order('date', { ascending: true })

      if (error) throw error

      if (!allFollowUps) {
        setFollowUps([])
        return
      }

      // Find the first follow-up (one with no previous follow-up pointing to it)
      const followUpMap = new Map(allFollowUps.map(fu => [fu.id, fu]))
      const hasIncomingEdge = new Set(allFollowUps.map(fu => fu.next_follow_up_id).filter(Boolean))
      const firstFollowUp = allFollowUps.find(fu => !hasIncomingEdge.has(fu.id))

      if (!firstFollowUp) {
        // If no first follow-up found (shouldn't happen), fall back to date ordering
        const sortedFollowUps = allFollowUps
          .sort((a, b) => {
            const dateA = a.date ? new Date(a.date).getTime() : 0
            const dateB = b.date ? new Date(b.date).getTime() : 0
            return dateA - dateB
          })
          .map(fu => ({
            ...fu,
            type: (fu.type as FollowUpType) || null
          }))
        setFollowUps(sortedFollowUps)
        return
      }

      // Build the ordered list by following the next_follow_up_id links
      const orderedFollowUps: FollowUp[] = []
      let current: typeof firstFollowUp | null = firstFollowUp
      while (current) {
        orderedFollowUps.push({
          ...current,
          type: (current.type as FollowUpType) || null
        })
        current = current.next_follow_up_id ? followUpMap.get(current.next_follow_up_id) || null : null
      }

      setFollowUps(orderedFollowUps)
      
      // Select the next incomplete follow-up
      const nextFollowUp = orderedFollowUps.find(fu => !fu.completed_at)
      if (nextFollowUp) {
        setSelectedFollowUp(nextFollowUp)
      }
    } catch (err) {
      console.error('Error loading follow-ups:', err)
    }
  }, [id])

  const loadCustomer = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('users')
        .select(`
          *,
          companies (
            id,
            name
          )
        `)
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      if (!data) {
        throw new Error('Customer not found')
      }

      const customer = {
        ...data,
        company_id: data.companies?.id
      }

      setCustomer(customer)
      setEditedCustomer(customer)
      
      // Load internal notes from communications
      const { data: communications, error: commsError } = await supabase
        .from('communications')
        .select()
        .match({ 
          user_id: id,
          direction: 'internal'
        })
        .is('deleted_at', null)
        .order('created_at', { ascending: true })

      if (commsError) throw commsError

      // Create a case with the internal notes
      const mockCase: Case = {
        id: 1,
        status: "New",
        createdAt: new Date().toISOString(),
        type: "Sales",
        interactions: (communications || []).map(comm => ({
          type: 'internal',
          date: format(new Date(comm.created_at), 'MMM d, yyyy h:mm a'),
          content: comm.content,
          sender: 'agent',
          agentName: comm.from_address
        }))
      }
      setCases([mockCase])
      setActiveCase(mockCase)

      // Load follow-ups
      await loadFollowUps()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customer')
      console.error('Error loading customer:', err)
    } finally {
      setLoading(false)
    }
  }, [id, loadFollowUps])

  useEffect(() => {
    loadCustomer()
    loadAgents()
    loadCompanies()

    // Set up real-time subscription for communications with retry logic
    let retryCount = 0
    const maxRetries = 3
    const retryDelay = 5000 // 5 seconds
    let retryTimeout: NodeJS.Timeout | null = null

    const setupSubscription = () => {
      const channel = supabase
        .channel(`communications-${id}-${Date.now()}`) // Add unique identifier with timestamp
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'communications',
            filter: `user_id=eq.${id} AND direction=eq.internal`
          },
          (payload) => {
            console.log('Received communication change:', payload)
            loadCustomer() // Reload all data when communications change
          }
        )
        .subscribe((status, err) => {
          console.log('Subscription status:', status)
          
          if (err) {
            console.error('Subscription error:', err)
          }

          if (status === 'SUBSCRIBED') {
            console.log('Successfully subscribed to communications changes')
            retryCount = 0 // Reset retry count on successful subscription
          }

          if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
            console.error(`Subscription ${status}:`, err)
            
            // Attempt to resubscribe if under max retries
            if (retryCount < maxRetries) {
              retryCount++
              console.log(`Retrying subscription (attempt ${retryCount}/${maxRetries})...`)
              
              // Clear any existing retry timeout
              if (retryTimeout) {
                clearTimeout(retryTimeout)
              }
              
              // Set up new retry
              retryTimeout = setTimeout(() => {
                channel.unsubscribe()
                setupSubscription()
              }, retryDelay * Math.pow(2, retryCount - 1)) // Exponential backoff
            } else {
              console.error('Max retries reached, subscription failed')
            }
          }

          if (status === 'CLOSED') {
            console.log('Subscription closed')
          }
        })

      return channel
    }

    const channel = setupSubscription()

    // Cleanup subscription and any pending retries on unmount
    return () => {
      console.log('Cleaning up subscription')
      if (retryTimeout) {
        clearTimeout(retryTimeout)
      }
      channel.unsubscribe()
    }
  }, [id, loadCustomer, loadCompanies]) // Keep loadCustomer and loadCompanies in dependencies

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          console.log('No session found in dashboard, redirecting to login')
          router.replace('/login')
          return
        }

        // Get current user's role
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('role')
          .eq('id', session.user.id)
          .single()

        if (userError) throw userError
        if (userData) {
          setCurrentUserRole(userData.role as UserRole)
        }
      } catch (err) {
        console.error('Error checking session:', err)
      }
    }
    checkSession()
  }, [router])

  // Function to check if editing is allowed
  const canEdit = () => {
    if (!customer || !currentUserRole) return false
    
    // Super admins can edit everything
    if (currentUserRole === 'super_admin') return true
    
    // For leads and customers, anyone can edit
    if (customer.role === 'lead' || customer.role === 'customer') return true
    
    // For other roles (agent, admin, super_admin), only super_admin can edit
    return false
  }

  const loadAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, first_name, last_name')
        .in('role', ['agent', 'admin', 'super_admin'])
        .is('deleted_at', null)
      
      if (error) throw error
      setAgents(data || [])
    } catch (err) {
      console.error('Error loading agents:', err)
    }
  }

  useEffect(() => {
    const tab = searchParams.get("tab")
    if (tab === "cases") {
      setActiveTab("cases")
    }
  }, [searchParams])

  useEffect(() => {
    if (scrollContainerRef.current) {
      const scrollContainer = scrollContainerRef.current
      const nextFollowUpIndex = followUps.findIndex((fu) => !fu.completed_at)
      const scrollToIndex = Math.max(0, nextFollowUpIndex - 1)
      scrollContainer.scrollLeft = scrollToIndex * 120
    }
  }, [followUps])

  const handleSendResponse = async () => {
    if (!responseMessage.trim() || !customer) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('No session found')
      }

      if (responseChannel === "internal") {
        const { error } = await supabase
          .from('communications')
          .insert({
            direction: 'internal',
            to_address: session.user.email || '',
            from_address: session.user.email || '',
            content: responseMessage.trim(),
            agent_id: session.user.id,
            user_id: customer.id,
            delivered_at: new Date().toISOString()
          })

        if (error) throw error

        // Update the UI by adding the new note to the active case
        if (activeCase) {
          const newInteraction: Interaction = {
            type: 'internal',
            date: format(new Date(), 'MMM d, yyyy h:mm a'),
            content: responseMessage.trim(),
            sender: 'agent',
            agentName: session.user.email || ''
          }

          setActiveCase(prev => prev ? {
            ...prev,
            interactions: [...prev.interactions, newInteraction]
          } : null)
        }

        // Clear the message after successful send
        setResponseMessage("")
      } else if (responseChannel === "email") {
        try {
          // First check if we have an email integration
          const { data: integrations, error: integrationError } = await supabase
            .from('email_integrations')
            .select('*')
            .eq('user_id', session.user.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })

          if (integrationError) {
            throw new Error(`Failed to check email integration: ${integrationError.message}`)
          }

          if (!integrations || integrations.length === 0) {
            // Show a more helpful error message with a link to set up email
            setError(
              <div className="text-red-500 space-y-2">
                <span className="block">No email integration found.</span>
                <span className="block">
                  Please{' '}
                  <Link href="/settings/integrations" className="text-blue-600 hover:underline">
                    set up your email integration in Settings
                  </Link>
                  {' '}before sending emails.
                </span>
              </div>
            )
            return
          }

          // Send email via API endpoint
          const apiUrl = '/api/email/send'

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              to: customer.email,
              subject: `Re: Case #${activeCase?.id || 'New'}`,
              content: responseMessage.trim()
            })
          })

          const data = await response.json()
          
          if (!response.ok) {
            console.error('Error sending email:', {
              status: response.status,
              statusText: response.statusText,
              data,
              url: apiUrl
            })
            if (data.error?.includes('needs to be reconnected') || data.error?.includes('token has expired')) {
              setError(
                <div className="text-red-500 space-y-2">
                  <span className="block">{data.error}</span>
                  <span className="block">
                    Please{' '}
                    <Link href="/settings/integrations" className="text-blue-600 hover:underline">
                      reconnect your email integration in Settings
                    </Link>
                    {' '}to continue sending emails.
                  </span>
                </div>
              )
            } else {
              throw new Error(data.error || `Failed to send email: ${response.status} ${response.statusText}`)
            }
            return
          }

          // Record the communication
          const { error: commError } = await supabase
            .from('communications')
            .insert({
              direction: 'outbound',
              to_address: customer.email || '',
              from_address: session.user.email || '',
              content: responseMessage.trim(),
              agent_id: session.user.id,
              user_id: customer.id,
              delivered_at: new Date().toISOString()
            })

          if (commError) throw commError

          // Update the UI
          if (activeCase) {
            const newInteraction: Interaction = {
              type: 'email',
              date: format(new Date(), 'MMM d, yyyy h:mm a'),
              content: responseMessage.trim(),
              sender: 'agent',
              agentName: session.user.email || ''
            }

            setActiveCase(prev => prev ? {
              ...prev,
              interactions: [...prev.interactions, newInteraction]
            } : null)
          }

          // Clear the message only after successful send
          setResponseMessage("")
        } catch (emailError) {
          console.error('Error sending email:', emailError)
          setError(emailError instanceof Error ? emailError.message : 'Failed to send email')
        }
      } else {
        console.log(`Sending ${responseChannel} response: ${responseMessage}`)
      }
    } catch (error) {
      console.error('Error sending response:', error)
      setError(error instanceof Error ? error.message : 'Failed to send response')
    }
  }

  const handleSaveCustomer = async () => {
    if (!editedCustomer) return

    try {
      setLoading(true)
      
      // Call the update API endpoint instead of direct Supabase update
      const response = await fetch('/api/users/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: editedCustomer.id,
          first_name: editedCustomer.first_name,
          last_name: editedCustomer.last_name,
          email: editedCustomer.email,
          phone: editedCustomer.phone,
          position: editedCustomer.position,
          company_id: editedCustomer.company_id,
          notes: editedCustomer.notes,
          status: editedCustomer.status,
          owner_id: editedCustomer.owner_id,
          role: editedCustomer.role,
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update user')
      }

      // Reload the customer to get the updated data
      const { data: updatedData, error: fetchError } = await supabase
        .from('users')
        .select(`
          *,
          companies (
            name
          )
        `)
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError
      if (!updatedData) throw new Error('Failed to reload customer data')

      const updatedCustomer = {
        ...updatedData,
        company_id: updatedData.companies?.id
      }

      setCustomer(updatedCustomer)
      setEditedCustomer(updatedCustomer)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update customer')
      console.error('Error updating customer:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleClickToDial = () => {
    if (!customer?.phone) return
    console.log(`Initiating call to ${customer.phone}`)
  }

  const handleMarkAsLost = async () => {
    if (!customer) return

    try {
      setLoading(true)
      const updates: Database['public']['Tables']['users']['Update'] = {
        lost_reason: lostReason || null,
        lost_at: new Date().toISOString(),
        status: 'lost'
      }

      const { error: markError } = await supabase
        .from('users')
        .update(updates)
        .eq('id', id)

      if (markError) throw markError

      setCustomer(prev => prev ? {
        ...prev,
        lost_reason: lostReason || null,
        lost_at: new Date().toISOString(),
        status: 'lost'
      } : null)
    } catch (err) {
      console.error('Error marking customer as lost:', err)
    } finally {
      setLoading(false)
      setIsMarkingAsLost(false)
    }
  }

  const handleConvertToCustomer = async () => {
    if (!customer) return

    try {
      setLoading(true)
      
      // Call the convert-to-customer API endpoint
      const response = await fetch('/api/users/convert-to-customer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: customer.id
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to convert to customer')
      }

      // Update local state
      setCustomer(prev => prev ? {
        ...prev,
        role: 'customer',
        status: 'won'
      } : null)

      // Reload follow-ups to show new sequence
      await loadFollowUps()
    } catch (err) {
      console.error('Error converting to customer:', err)
      setError(err instanceof Error ? err.message : 'Failed to convert to customer')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateFollowUp = async (updates: Partial<FollowUp>) => {
    if (!selectedFollowUp || !customer) return

    try {
      setIsUpdatingFollowUps(true)
      const updateData: Database['public']['Tables']['follow_ups']['Update'] = {}
      
      // Only update type if it's provided in updates
      if (updates.type) {
        updateData.type = updates.type
      }
      
      // Handle date updates
      if (updates.date) {
        updateData.date = updates.date

        // Find all follow-ups after the selected one
        const selectedIndex = followUps.findIndex(fu => fu.id === selectedFollowUp.id)
        if (selectedIndex !== -1 && selectedFollowUp.date) {
          const subsequentFollowUps = followUps.slice(selectedIndex + 1)
          console.log('Found subsequent follow-ups:', subsequentFollowUps)
          
          if (subsequentFollowUps.length > 0) {
            // Calculate the time difference between the old and new date
            const oldDate = new Date(selectedFollowUp.date)
            const newDate = new Date(updates.date)
            const timeDifference = newDate.getTime() - oldDate.getTime()
            console.log('Time difference:', timeDifference, 'ms')

            // Update each follow-up in sequence
            for (const followUp of subsequentFollowUps) {
              if (!followUp.date) continue
              
              const currentDate = new Date(followUp.date)
              const newFollowUpDate = new Date(currentDate.getTime() + timeDifference)
              console.log(`Updating follow-up ${followUp.id} from ${followUp.date} to ${newFollowUpDate.toISOString()}`)
              
              const { error: updateError } = await supabase
                .from('follow_ups')
                .update({ date: newFollowUpDate.toISOString() })
                .eq('id', followUp.id)

              if (updateError) {
                console.error(`Error updating follow-up ${followUp.id}:`, updateError)
                throw updateError
              }
            }
          }
        }
      }
      
      // Handle completion status separately
      if ('completed' in updates) {
        updateData.completed_at = updates.completed ? new Date().toISOString() : null

        // If marking as complete and user is a lead, update their status to awaiting_response
        if (updates.completed && customer.role === 'lead') {
          const { error: userError } = await supabase
            .from('users')
            .update({ status: 'awaiting_response' })
            .eq('id', customer.id)

          if (userError) throw userError

          // Fetch the updated user data
          const { data: updatedUser, error: fetchError } = await supabase
            .from('users')
            .select(`
              *,
              companies (
                id,
                name
              )
            `)
            .eq('id', customer.id)
            .single()

          if (fetchError) throw fetchError

          if (updatedUser) {
            const updatedCustomer = {
              ...updatedUser,
              company_id: updatedUser.companies?.id
            }
            // Update both customer and editedCustomer states
            setCustomer(updatedCustomer)
            setEditedCustomer(updatedCustomer)
          }
        }
      }

      // Update the selected follow-up
      const { error } = await supabase
        .from('follow_ups')
        .update(updateData)
        .eq('id', selectedFollowUp.id)

      if (error) throw error

      await loadFollowUps()
    } catch (err) {
      console.error('Error updating follow-up:', err)
    } finally {
      setIsUpdatingFollowUps(false)
    }
  }

  const createFollowUp = async (date: Date, type: FollowUpType = 'email') => {
    if (!customer) return

    try {
      // Get the expected sequence dates
      const sequenceDates = calculateFollowUpDates(new Date(customer.created_at), customer.role as 'lead' | 'customer')
      
      // Create all follow-ups in the sequence
      const followUpsToCreate = sequenceDates.map((sequenceDate) => ({
        user_id: customer.id,
        date: sequenceDate.toISOString(),
        completed: false,
        type: type
      }))

      // Insert all follow-ups
      const { data: newFollowUps, error } = await supabase
        .from('follow_ups')
        .insert(followUpsToCreate)
        .select()

      if (error) throw error

      // Update next_follow_up_id links
      if (newFollowUps) {
        for (let i = 0; i < newFollowUps.length - 1; i++) {
          await supabase
            .from('follow_ups')
            .update({ next_follow_up_id: newFollowUps[i + 1].id })
            .eq('id', newFollowUps[i].id)
        }
      }

      // Reload follow-ups to get the updated list
      await loadFollowUps()
    } catch (err) {
      console.error('Error creating follow-up sequence:', err)
    }
  }

  const handleDelete = async () => {
    try {
      setIsDeleting(true)
      setDeleteError(null)

      // Soft delete the user by setting deleted_at
      const { error: deleteError } = await supabase
        .from('users')
        .update({ 
          deleted_at: new Date().toISOString(),
          status: 'lost' as const // Change to 'lost' instead of 'inactive'
        })
        .eq('id', id)

      if (deleteError) throw deleteError

      // Redirect to users list
      router.push('/users')
      router.refresh()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete user')
      console.error('Error deleting user:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  const formatDateSafe = (dateStr: string | null | undefined): string => {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return ''
      return format(date, 'MMM d, yyyy')
    } catch (err) {
      console.error('Error formatting date:', err)
      return ''
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading customer details...</p>
      </div>
    )
  }

  if (error || !customer || !editedCustomer) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">Error: {error || 'Customer not found'}</div>
      </div>
    )
  }

  return (
    <div className="space-y-4 bg-gray-50 min-h-screen p-6">
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{getCustomerDisplayName(customer)}</h1>
            <p className="text-gray-500">
              {customer?.company_id ? (
                <>
                  <Link 
                    href={`/companies/${customer?.company_id}`}
                    className="text-brand-darkBlue/70 hover:text-brand-darkBlue hover:underline"
                  >
                    {customer?.companies?.name}
                  </Link>
                  {customer?.position && (
                    <>
                      <span className="mx-1">·</span>
                      <span>{customer.position}</span>
                    </>
                  )}
                </>
              ) : customer?.position ? (
                <span>{customer.position}</span>
              ) : null}
            </p>
          </div>
          <div className="flex items-start gap-4">
            {customer?.role === 'lead' && customer?.status !== 'lost' && customer?.status !== 'won' && (
              <>
                <Dialog open={isMarkingAsLost} onOpenChange={setIsMarkingAsLost}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="border-brand-darkRed text-brand-darkRed hover:bg-brand-darkRed hover:text-white"
                    >
                      Mark as Lost
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Mark Lead as Lost</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                      <Label htmlFor="lost-reason" className="mb-2 block">
                        Select a reason:
                      </Label>
                      <RadioGroup id="lost-reason" value={lostReason} onValueChange={setLostReason}>
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
                      <Button variant="destructive" onClick={handleMarkAsLost} disabled={loading}>
                        {loading ? 'Marking as Lost...' : 'Mark as Lost'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button
                  onClick={handleConvertToCustomer}
                  className="bg-brand-darkBlue hover:bg-brand-darkBlue/90 text-white"
                >
                  Mark as Won
                </Button>
              </>
            )}
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="text-red-600 border-red-600 hover:bg-red-50" disabled={isDeleting}>
                  {isDeleting ? 'Deleting...' : 'Delete User'}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Are you sure you want to delete this user?</DialogTitle>
                </DialogHeader>
                <p className="text-muted-foreground">
                  This action cannot be undone. This will permanently delete the user and all associated follow-ups.
                </p>
                {deleteError && (
                  <div className="text-red-500">{deleteError}</div>
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
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Follow-up Sequence</CardTitle>
            {customer && (
              <p className="text-sm text-gray-500">
                Based on {customer.role} creation date: {formatDateSafe(customer.created_at)}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div
                ref={scrollContainerRef}
                className="flex overflow-x-auto space-x-4 p-4 scrollbar-hide"
                style={{ scrollBehavior: "smooth" }}
              >
                {followUps.map((followUp) => {
                  const isCompleted = !!followUp.completed_at
                  const followUpDate = followUp.date ? new Date(followUp.date) : null
                  
                  return (
                    <div
                      key={followUp.id}
                      className={`flex-shrink-0 flex flex-col items-center justify-center w-28 h-32 border rounded-md cursor-pointer
                        ${selectedFollowUp?.id === followUp.id ? "bg-blue-100 border-blue-500" : "bg-white"}
                        ${isCompleted ? "opacity-50" : ""}
                        ${isUpdatingFollowUps ? "opacity-50 cursor-not-allowed" : ""}`}
                      onClick={() => !isUpdatingFollowUps && setSelectedFollowUp(followUp)}
                    >
                      <Calendar
                        className={`h-6 w-6 ${selectedFollowUp?.id === followUp.id ? "text-blue-500" : "text-gray-500"}`}
                      />
                      <span className="text-sm font-medium">
                        {followUpDate ? followUpDate.toLocaleDateString() : '-'}
                      </span>
                      <Badge variant="secondary" className="mt-1">
                        {followUp.type || 'email'}
                      </Badge>
                      {isCompleted && <Check className="text-green-500 mt-1" />}
                    </div>
                  )
                })}
              </div>
              {followUps.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute left-0 top-1/2 transform -translate-y-1/2"
                    onClick={() => {
                      if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollLeft -= 120
                      }
                    }}
                    disabled={isUpdatingFollowUps}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute right-0 top-1/2 transform -translate-y-1/2"
                    onClick={() => {
                      if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollLeft += 120
                      }
                    }}
                    disabled={isUpdatingFollowUps}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
            {customer && followUps.length === 0 && (
              <div className="mt-4 p-4 bg-gray-100 rounded-lg">
                <p className="text-sm font-medium">Expected {customer.role} follow-up sequence:</p>
                <p className="text-sm text-gray-600">
                  Days: {getExpectedSequence(customer.role as 'lead' | 'customer').join(', ')}
                </p>
                <Button 
                  onClick={() => createFollowUp(new Date(), 'email')}
                  className="mt-4"
                >
                  Create Follow-up Sequence
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Selected Follow-up</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedFollowUp ? (
              <div className="space-y-4">
                {isUpdatingFollowUps && (
                  <div className="bg-blue-50 text-blue-700 p-3 rounded-lg flex items-center space-x-2">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-700 border-t-transparent rounded-full" />
                    <span>Updating follow-up sequence...</span>
                  </div>
                )}
                <div>
                  <Label>Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button 
                        variant={"outline"} 
                        className={`w-full justify-start text-left font-normal ${isUpdatingFollowUps ? 'opacity-50' : ''}`}
                        disabled={isUpdatingFollowUps}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {selectedFollowUp.date ? format(new Date(selectedFollowUp.date), "PPP") : 'No date set'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <CalendarComponent
                        mode="single"
                        selected={selectedFollowUp.date ? new Date(selectedFollowUp.date) : undefined}
                        onSelect={(date) => date && handleUpdateFollowUp({ date: date.toISOString() })}
                        initialFocus
                        disabled={isUpdatingFollowUps}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label htmlFor="followup-type">Type</Label>
                  <Select
                    value={selectedFollowUp.type || undefined}
                    onValueChange={(value) => handleUpdateFollowUp({ type: value as FollowUpType })}
                    disabled={isUpdatingFollowUps}
                  >
                    <SelectTrigger id="followup-type" className={isUpdatingFollowUps ? 'opacity-50' : ''}>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {followUpTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="followup-completed"
                    checked={!!selectedFollowUp?.completed_at}
                    onCheckedChange={(checked) => handleUpdateFollowUp({ completed: checked as boolean })}
                    disabled={isUpdatingFollowUps}
                    className={isUpdatingFollowUps ? 'opacity-50' : ''}
                  />
                  <Label htmlFor="followup-completed" className={isUpdatingFollowUps ? 'opacity-50' : ''}>
                    Completed
                  </Label>
                </div>
              </div>
            ) : (
              <p>No follow-up selected.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <h2 className="text-xl font-semibold mt-6">User Details</h2>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="bg-white rounded-lg shadow">
        <TabsList className="w-full bg-gray-100 p-1 rounded-t-lg">
          <TabsTrigger value="info" className="flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Basic Information
          </TabsTrigger>
          <TabsTrigger value="cases" className="flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Cases
          </TabsTrigger>
        </TabsList>
        <TabsContent value="info" className="p-6">
          <div className="space-y-4">
            {!canEdit() && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md mb-4">
                Only super admins can edit details for agents and admins.
              </div>
            )}
            <div className="grid grid-cols-2 gap-8">
              {/* Personal Information */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Personal Information</h3>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="first_name">First Name</Label>
                      <Input
                        id="first_name"
                        value={editedCustomer?.first_name || ''}
                        onChange={(e) => setEditedCustomer(prev => ({ ...prev!, first_name: e.target.value }))}
                        className="mt-1"
                        disabled={!canEdit()}
                      />
                    </div>
                    <div>
                      <Label htmlFor="last_name">Last Name</Label>
                      <Input
                        id="last_name"
                        value={editedCustomer?.last_name || ''}
                        onChange={(e) => setEditedCustomer(prev => ({ ...prev!, last_name: e.target.value }))}
                        className="mt-1"
                        disabled={!canEdit()}
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        value={editedCustomer?.email || ''}
                        onChange={(e) => setEditedCustomer(prev => ({ ...prev!, email: e.target.value }))}
                        className="mt-1"
                        disabled={!canEdit()}
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={editedCustomer?.phone || ''}
                        onChange={(e) => setEditedCustomer(prev => ({ ...prev!, phone: e.target.value }))}
                        className="mt-1"
                        disabled={!canEdit()}
                      />
                    </div>
                  </div>
                </div>

                {/* Company Information */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Company Information</h3>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="company">Company</Label>
                      <Select
                        value={editedCustomer?.company_id || 'none'}
                        onValueChange={(value) => setEditedCustomer(prev => ({ ...prev!, company_id: value === 'none' ? null : value }))}
                        disabled={!canEdit()}
                      >
                        <SelectTrigger id="company" className="mt-1">
                          <SelectValue placeholder="Select company" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Company</SelectItem>
                          {companies.map((company) => (
                            <SelectItem key={company.id} value={company.id}>
                              {company.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="position">Position</Label>
                      <Input
                        id="position"
                        value={editedCustomer?.position || ''}
                        onChange={(e) => setEditedCustomer(prev => ({ ...prev!, position: e.target.value }))}
                        className="mt-1"
                        disabled={!canEdit()}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {/* Role & Status */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Role & Status</h3>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="role">Role</Label>
                      <Select
                        value={editedCustomer?.role || ''}
                        onValueChange={(value) => setEditedCustomer(prev => ({ ...prev!, role: value as UserRole }))}
                        disabled={!canEdit()}
                      >
                        <SelectTrigger id="role" className="mt-1">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lead">Lead</SelectItem>
                          <SelectItem value="customer">Customer</SelectItem>
                          <SelectItem value="agent">Agent</SelectItem>
                          {['admin', 'super_admin'].includes(currentUserRole || '') && (
                            <SelectItem value="admin">Admin</SelectItem>
                          )}
                          {(currentUserRole === 'super_admin' || editedCustomer?.role === 'super_admin') && (
                            <SelectItem value="super_admin">Super Admin</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={editedCustomer?.status || ''}
                        onValueChange={(value) => setEditedCustomer(prev => ({ ...prev!, status: value as UserStatus }))}
                        disabled={!canEdit()}
                      >
                        <SelectTrigger id="status" className="mt-1">
                          <SelectValue>
                            {editedCustomer?.status === 'won' 
                              ? 'Won'
                              : editedCustomer?.status === 'lost'
                                ? 'Lost'
                                : editedCustomer?.status?.split('_')
                                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                    .join(' ') || 'Select status'
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {/* Only show non-won/lost options in dropdown */}
                          <SelectItem value="needs_response">Needs Response</SelectItem>
                          <SelectItem value="awaiting_response">Awaiting Response</SelectItem>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="follow_up">Follow Up</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="owner">Owner</Label>
                      <Select
                        value={editedCustomer?.owner_id || 'unassigned'}
                        onValueChange={(value) => setEditedCustomer(prev => ({ ...prev!, owner_id: value === 'unassigned' ? null : value }))}
                        disabled={!canEdit()}
                      >
                        <SelectTrigger id="owner" className="mt-1">
                          <SelectValue>
                            {editedCustomer?.owner_id === undefined 
                              ? 'Unassigned'
                              : (() => {
                                  const agent = agents.find(a => a.id === editedCustomer?.owner_id);
                                  return agent
                                    ? `${agent.first_name || 'Agent'} (${agent.email || `User ${agent.id}`})`
                                    : 'Select owner'
                                })()
                          }
                          </SelectValue>
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
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Notes</h3>
                  <div>
                    <Label htmlFor="notes">Additional Notes</Label>
                    <Textarea
                      id="notes"
                      value={editedCustomer?.notes || ''}
                      onChange={(e) => setEditedCustomer(prev => ({ ...prev!, notes: e.target.value }))}
                      className="mt-1 h-32"
                      disabled={!canEdit()}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-2 mt-4">
              {canEdit() && (
                <>
                  <Button variant="outline" onClick={() => setEditedCustomer(customer)}>
                    Reset Changes
                  </Button>
                  <Button onClick={handleSaveCustomer} disabled={loading}>
                    {loading ? 'Saving...' : 'Save Changes'}
                  </Button>
                </>
              )}
            </div>
            {error && (
              <p className="text-red-500 mt-2">{error}</p>
            )}
          </div>
        </TabsContent>
        <TabsContent value="cases" className="p-6">
          <div className="flex space-x-6">
            <div className="w-1/3 bg-gray-100 p-4 rounded-lg space-y-4 max-h-[800px] overflow-y-auto">
              <h2 className="text-lg font-semibold">Cases</h2>
              {cases.map((c) => (
                <div key={c.id} className="space-y-2">
                  <Button
                    variant={c === activeCase ? "default" : "outline"}
                    className={`w-full justify-start items-center ${
                      c === activeCase ? "bg-blue-100 text-blue-800" : "bg-white"
                    }`}
                    onClick={() => setActiveCase(c)}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span>Case {c.id}</span>
                      <Badge
                        variant="secondary"
                        className={`ml-2 text-xs ${c === activeCase ? "bg-blue-200 text-blue-800" : ""}`}
                      >
                        {c.type}
                      </Badge>
                    </div>
                  </Button>
                  {c === activeCase && (
                    <div className="bg-white p-3 rounded-md text-sm space-y-2 border border-blue-200">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Status</span>
                        <span className="text-gray-600">{c.status}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Created</span>
                        <span className="text-gray-600">{formatDateSafe(c.createdAt)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Type</span>
                        <Badge variant="outline" className="text-xs">
                          {c.type}
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {activeCase && (
              <div className="w-2/3 space-y-4">
                <div className="bg-white p-6 rounded-lg shadow">
                  <h2 className="text-lg font-semibold mb-4">Conversation History</h2>
                  <div className="space-y-4 max-h-[800px] overflow-y-auto bg-gray-50 p-4 rounded-lg">
                    {activeCase.interactions.map((interaction: Interaction, index: number) => {
                      return (
                        <div
                          key={index}
                          className={`flex ${interaction.sender === "agent" ? "justify-end" : "justify-start"}`}
                        >
                          {interaction.type === "call" ? (
                            <div className="bg-gray-100 p-3 rounded-lg max-w-[80%]">
                              <div className="flex items-center space-x-2">
                                <Avatar>
                                  <AvatarImage src="/placeholder-avatar.jpg" alt="Agent" />
                                  <AvatarFallback>AG</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-semibold">Call on {interaction.date}</p>
                                  <p>{interaction.content}</p>
                                  {interaction.duration && <p>Duration: {interaction.duration}</p>}
                                </div>
                              </div>
                              {interaction.recordingUrl && (
                                <Button variant="outline" size="sm" className="mt-2">
                                  <Play className="mr-2 h-4 w-4" /> Play Recording
                                </Button>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {interaction.sender === "customer" && (
                                <p className="text-xs text-gray-500">
                                  {interaction.type === "email"
                                    ? customer?.email
                                    : interaction.type === "sms"
                                      ? customer?.phone
                                      : ""}
                                </p>
                              )}
                              {interaction.sender === "agent" && interaction.agentName && (
                                <p className="text-xs text-gray-500 text-right">
                                  Agent: {interaction.agentName} via{" "}
                                  {interaction.type === "email"
                                    ? "Email"
                                    : interaction.type === "sms"
                                      ? "SMS"
                                      : interaction.type}
                                </p>
                              )}
                              <div
                                className={`p-3 rounded-lg max-w-[80%] ${
                                  interaction.type === "internal"
                                    ? "bg-yellow-100 w-full"
                                    : interaction.sender === "agent"
                                      ? "bg-blue-100"
                                      : "bg-gray-100"
                                }`}
                              >
                                <p className="text-sm text-gray-500 mb-1">
                                  {interaction.date}
                                  {interaction.type === "internal" && " - Internal Note"}
                                </p>
                                <p>{interaction.content}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex space-x-2 mt-4 bg-gray-100 p-4 rounded-lg">
                    <Select value={responseChannel} onValueChange={setResponseChannel}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Channel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="internal">Internal</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      placeholder="Type your response..."
                      value={responseMessage}
                      onChange={(e) => setResponseMessage(e.target.value)}
                      className="flex-grow"
                    />
                    <Button onClick={handleSendResponse}>
                      <Send className="mr-2 h-4 w-4" />
                      {responseChannel === "internal" ? "Add Note" : "Send"}
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline">
                          <Phone className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80">
                        <div className="grid gap-4">
                          <div className="space-y-2">
                            <h4 className="font-medium leading-none">Click to Dial</h4>
                            <p className="text-sm text-muted-foreground">
                              Initiate a call to {customer ? (customer.first_name || '') + ' ' + (customer.last_name || '') || 'no phone number' : 'no phone number'}
                            </p>
                          </div>
                          <Button onClick={handleClickToDial}>
                            <Phone className="mr-2 h-4 w-4" /> Call {customer ? (customer.first_name || '') + ' ' + (customer.last_name || '') || 'customer' : 'customer'}
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}


