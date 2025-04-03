"use client"

import { useState, useEffect, useRef, useCallback, use } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Play, Calendar, ChevronLeft, ChevronRight, Check } from "lucide-react"
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
import { OwnerCombobox } from "@/components/ui/owner-combobox"
import { MessageInput } from "@/components/message-input"
import { ReferralPartnerCompanyCombobox } from "@/components/ui/referral-partner-company-combobox"
import { VOBForm } from "@/components/vob-form"

type UserRole = Database['public']['Tables']['users']['Row']['role']
type FollowUpType = 'email' | 'sms' | 'call' | 'meeting' | 'tour'

type UserStatus = 'new' | 'needs_response' | 'awaiting_response' | 'follow_up' | 'won' | 'lost'

type Customer = Database['public']['Tables']['users']['Row'] & {
  status: UserStatus;
  company_id: string | null;
  notes: string | null;
  linkedin: string | null;
  referring_user_id: string | null;
  companies?: {
    id: string;
    name: string;
  } | null;
}

type Agent = {
  id: string;
  email: string | null;
  first_name: string | null;
  role: string;
}

type FollowUp = Database['public']['Tables']['follow_ups']['Row'] & {
  type: FollowUpType
  completed?: boolean
  lost_at?: string | null
  lost_reason?: string | null
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

type FormData = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  role: UserRole;
  status: UserStatus;
  owner_id: string | null;
  notes: string;
  lead_type: 'referral_partner' | 'potential_customer' | null;
  company_id: string | null;
  referrer_id: string | null;
  referring_user_id: string | null;
}

type B2CLeadInfo = {
  address: string;
  gender: 'Male' | 'Female' | 'Non-binary' | 'Other' | 'Prefer not to say';
  ssn_last_four: string;
  marital_status: 'Single' | 'Married' | 'Divorced' | 'Widowed';
  parental_status: 'Has children' | 'No children';
  referral_source: string;
  headshot_url: string | null;
  dob: string;
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
  const [isEditable, setIsEditable] = useState<boolean>(false)
  const router = useRouter()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [companies, setCompanies] = useState<Database['public']['Tables']['companies']['Row'][]>([])
  const [currentUser, setCurrentUser] = useState<Database['public']['Tables']['users']['Row'] | null>(null)
  const [formData, setFormData] = useState<FormData>({
    first_name: customer?.first_name || "",
    last_name: customer?.last_name || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
    position: customer?.position || "",
    role: customer?.role || "lead",
    status: customer?.status || "new",
    owner_id: customer?.owner_id || null,
    notes: customer?.notes || "",
    lead_type: customer?.lead_type || null,
    company_id: customer?.company_id || null,
    referrer_id: customer?.referring_user_id || null,
    referring_user_id: customer?.referring_user_id || null,
  })
  const [b2cLeadInfo, setB2cLeadInfo] = useState<B2CLeadInfo | null>(null)
  const [isLoadingB2CInfo, setIsLoadingB2CInfo] = useState(false)
  const [referringUsers, setReferringUsers] = useState<Database['public']['Tables']['users']['Row'][]>([])

  // Add this useEffect to update form data when customer changes
  useEffect(() => {
    if (customer) {
      setFormData({
        first_name: customer.first_name || "",
        last_name: customer.last_name || "",
        email: customer.email || "",
        phone: customer.phone || "",
        position: customer.position || "",
        role: customer.role || "lead",
        status: customer.status || "new",
        owner_id: customer.owner_id || null,
        notes: customer.notes || "",
        lead_type: customer.lead_type || null,
        company_id: customer.company_id || null,
        referrer_id: customer.referring_user_id || null,
        referring_user_id: customer.referring_user_id || null,
      })
      
      // Load B2C lead info if this is a potential customer
      if (customer.lead_type === 'potential_customer') {
        loadB2CLeadInfo();
      }
    }
  }, [customer])

  const loadCompanies = useCallback(async () => {
    try {
      console.log('Starting loadCompanies function...')
      
      let allCompanies: Database['public']['Tables']['companies']['Row'][] = [];
      let lastId: string | null = null;
      let hasMore = true;
      
      while (hasMore) {
        // Build query with pagination
        const query = supabase
          .from('companies')
          .select('*')
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .limit(1000);

        // Add starting point for pagination if we have a last ID
        if (lastId) {
          query.gt('id', lastId);
        }
        
        const { data: companies, error: companiesError } = await query;
        
        if (companiesError) {
          console.error('Error loading companies:', companiesError);
          return;
        }
        
        if (!companies || companies.length === 0) {
          hasMore = false;
        } else {
          allCompanies = [...allCompanies, ...companies];
          lastId = companies[companies.length - 1].id;
          hasMore = companies.length === 1000; // If we got 1000 results, there might be more
        }
      }
      
      // Sort all companies by name after we have the complete set
      allCompanies.sort((a, b) => {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });

      // Debug: Log companies starting with 'z'
      const zCompanies = allCompanies.filter(c => c.name?.toLowerCase().startsWith('z')) || [];
      console.log('Companies starting with Z:', zCompanies);
      console.log('Total number of companies:', allCompanies.length);
      
      setCompanies(allCompanies);
    } catch (err) {
      console.error('Error in loadCompanies:', err);
    }
  }, [])

  const loadFollowUps = useCallback(async () => {
    if (!id) return

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
      
      // First get the current user's organization ID
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const { data: currentUserData } = await supabase
        .from('users')
        .select('organization_id, role')
        .eq('id', session.user.id)
        .single()

      if (!currentUserData) throw new Error('Current user not found')

      // First try to get the user without organization filter
      const query = supabase
        .from('users')
        .select(`
          *,
          companies!company_id (
            id,
            name
          )
        `)
        .eq('id', id)

      const { data, error: fetchError } = await query.single()

      if (fetchError) throw fetchError

      if (!data) {
        throw new Error('Customer not found')
      }

      // Check if user has access to this customer based on organization
      if (currentUserData.role !== 'super_admin' && 
          currentUserData.organization_id && 
          data.organization_id !== currentUserData.organization_id) {
        throw new Error('You do not have access to this customer')
      }

      const customer = {
        ...data,
        company_id: data.companies?.id,
        owner: currentUser
      }

      setCustomer(customer)
      setEditedCustomer(customer)
      
      // Set editability based on loaded customer and current user role
      if (currentUserRole) {
        const canEditUser = 
          currentUserRole === 'super_admin' || 
          (customer.role === 'lead' || customer.role === 'customer');
        setIsEditable(canEditUser);
      }
      
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
  }, [id, loadFollowUps, currentUserRole, currentUser])

  const loadReferringUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('lead_type', 'referral_partner')
        .is('deleted_at', null)
        .order('first_name', { ascending: true })

      if (error) throw error
      setReferringUsers(data || [])
    } catch (err) {
      console.error('Error loading referring users:', err)
    }
  }, [])

  const loadAgents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, first_name, role')
        .in('role', ['agent', 'admin', 'super_admin'])
        .is('deleted_at', null)
      
      if (error) throw error
      setAgents(data || [])
    } catch (err) {
      console.error('Error loading agents:', err)
    }
  }, [])

  useEffect(() => {
    loadCustomer()
    loadAgents()
    loadCompanies()
    loadReferringUsers()

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
  }, [id, loadCustomer, loadCompanies, loadReferringUsers, loadAgents])

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        if (!session) {
          router.push('/login')
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
          console.log('Current user role:', userData.role);
          setCurrentUserRole(userData.role as UserRole)
          // Set editability based on role immediately
          const canEditUser = userData.role === 'super_admin' || 
            (customer?.role === 'lead' || customer?.role === 'customer')
          console.log('Setting isEditable:', canEditUser, {
            userRole: userData.role,
            customerRole: customer?.role
          });
          setIsEditable(canEditUser)
        }
      } catch (err) {
        console.error('Error checking session:', err)
      }
    }
    checkSession()
  }, [router, customer])

  useEffect(() => {
    const tab = searchParams?.get("tab") || ''
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
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          phone: formData.phone,
          position: formData.position,
          company_id: formData.company_id,
          referrer_id: formData.referrer_id,
          notes: formData.notes,
          status: formData.status,
          owner_id: formData.owner_id,
          role: formData.role,
          lead_type: formData.lead_type
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
          companies!company_id (
            id,
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
      console.error('Error updating customer:', err)
      setError(err instanceof Error ? err.message : 'Failed to update customer')
    } finally {
      setLoading(false)
    }
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

  const handleUpdateFollowUp = async (followUp: FollowUp, updates: Partial<FollowUp>) => {
    setIsUpdatingFollowUps(true)
    setError(null)

    try {
      const updateData: Partial<FollowUp> = {
        type: updates.type || followUp?.type,
        notes: updates.notes || followUp?.notes,
        completed_at: updates.completed_at || null
      }

      // Handle date updates
      if (updates.date) {
        updateData.date = updates.date

        // Find all follow-ups after the selected one
        const { data: laterFollowUps } = await supabase
          .from('follow_ups')
          .select('*')
          .eq('user_id', id)
          .gt('date', followUp.date)
          .order('date', { ascending: true })

        if (laterFollowUps) {
          // Update each follow-up's date to be 1 day after the previous one
          for (let i = 0; i < laterFollowUps.length; i++) {
            const currentDate = new Date(updates.date)
            currentDate.setDate(currentDate.getDate() + i + 1)
            
            await supabase
              .from('follow_ups')
              .update({ date: currentDate.toISOString() })
              .eq('id', laterFollowUps[i].id)
          }
        }
      }

      // Update the selected follow-up
      const { error } = await supabase
        .from('follow_ups')
        .update(updateData)
        .eq('id', followUp.id)

      if (error) throw error

      // Refresh the list
      await loadFollowUps()
    } catch (err) {
      console.error('Error updating follow-up:', err)
      setError(err instanceof Error ? err.message : 'Failed to update follow-up')
    } finally {
      setIsUpdatingFollowUps(false)
    }
  }

  const createFollowUp = async () => {
    if (!customer) return

    try {
      const sequenceDates = calculateFollowUpDates(new Date(customer.created_at), customer.role as 'lead' | 'customer')
      const followUpsToCreate = sequenceDates.map(sequenceDate => ({
        user_id: customer.id,
        date: sequenceDate.toISOString(),
        type: 'email',
        completed_at: null,
        next_follow_up_id: null
      }))

      const { data: newFollowUps, error } = await supabase
        .from('follow_ups')
        .insert(followUpsToCreate)
        .select()

      if (error) throw error

      // Update next_follow_up_id links
      for (let i = 0; i < newFollowUps.length - 1; i++) {
        await supabase
          .from('follow_ups')
          .update({ next_follow_up_id: newFollowUps[i + 1].id })
          .eq('id', newFollowUps[i].id)
      }

      await loadFollowUps()
    } catch (err) {
      console.error('Error creating follow-ups:', err)
      setError(err instanceof Error ? err.message : 'Failed to create follow-ups')
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

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        const { data: userData, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (error) throw error
        setCurrentUser(userData)
      } catch (err) {
        console.error('Error loading current user:', err)
      }
    }

    loadCurrentUser()
  }, [])

  // Add this function to load B2C lead info
  const loadB2CLeadInfo = async () => {
    if (!customer || customer.lead_type !== 'potential_customer') return;
    
    setIsLoadingB2CInfo(true);
    try {
      // First try to get existing record
      const { data: existingData, error: fetchError } = await supabase
        .from('b2c_lead_info')
        .select('*')
        .eq('user_id', id)
        .single();

      if (fetchError && fetchError.code === 'PGRST116') {
        // No record exists, create a new one
        const { data: newData, error: insertError } = await supabase
          .from('b2c_lead_info')
          .insert({
            user_id: id,
            address: '',
            gender: 'Prefer not to say',
            ssn_last_four: '',
            marital_status: 'Single',
            parental_status: 'No children',
            referral_source: '',
            headshot_url: null,
            dob: ''
          })
          .select()
          .single();

        if (insertError) throw insertError;
        setB2cLeadInfo(newData);
      } else if (fetchError) {
        throw fetchError;
      } else {
        setB2cLeadInfo(existingData);
      }
    } catch (err) {
      console.error('Error loading B2C lead info:', err);
    } finally {
      setIsLoadingB2CInfo(false);
    }
  };

  // Add this function to handle B2C lead info updates
  const handleSaveB2CLeadInfo = async () => {
    if (!b2cLeadInfo) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // First check if record exists
      const { data: existingData, error: fetchError } = await supabase
        .from('b2c_lead_info')
        .select('*')
        .eq('user_id', id)
        .single();

      const updateData = {
        user_id: id,
        address: b2cLeadInfo.address || '',
        gender: b2cLeadInfo.gender || 'Prefer not to say',
        ssn_last_four: b2cLeadInfo.ssn_last_four || '',
        marital_status: b2cLeadInfo.marital_status || 'Single',
        parental_status: b2cLeadInfo.parental_status || 'No children',
        referral_source: b2cLeadInfo.referral_source || '',
        headshot_url: b2cLeadInfo.headshot_url,
        dob: b2cLeadInfo.dob || '',
        updated_by: session.user.id
      };

      let result;
      if (fetchError && fetchError.code === 'PGRST116') {
        // No record exists, create new one
        result = await supabase
          .from('b2c_lead_info')
          .insert({
            ...updateData,
            created_by: session.user.id
          })
          .select()
          .single();
      } else if (fetchError) {
        throw fetchError;
      } else if (existingData) {
        // Record exists, update it
        result = await supabase
          .from('b2c_lead_info')
          .update(updateData)
          .eq('user_id', id)
          .select()
          .single();
      } else {
        throw new Error('Failed to determine record existence');
      }

      if (result.error) {
        console.error('Error saving B2C lead info:', result.error);
        throw new Error(result.error.message);
      }

      // Refresh the B2C lead info
      const { data, error: refreshError } = await supabase
        .from('b2c_lead_info')
        .select('*')
        .eq('user_id', id)
        .single();

      if (refreshError) {
        console.error('Error refreshing B2C lead info:', refreshError);
        throw new Error(refreshError.message);
      }

      setB2cLeadInfo(data);
    } catch (err) {
      console.error('Error saving B2C lead info:', err);
      setError(err instanceof Error ? err.message : 'Failed to save B2C lead information');
    }
  };

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
                  onClick={() => createFollowUp()}
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
                        {formatDateSafe(selectedFollowUp.date)}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <CalendarComponent
                        mode="single"
                        selected={selectedFollowUp.date ? new Date(selectedFollowUp.date) : undefined}
                        onSelect={(date) => date && handleUpdateFollowUp(selectedFollowUp, { date: date.toISOString() })}
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
                    onValueChange={(value) => handleUpdateFollowUp(selectedFollowUp, { type: value as FollowUpType })}
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
                    onCheckedChange={(checked) => handleUpdateFollowUp(selectedFollowUp, { completed_at: checked ? new Date().toISOString() : null })}
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
            Face Sheet
          </TabsTrigger>
          <TabsTrigger value="cases" className="flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Cases
          </TabsTrigger>
          <TabsTrigger value="vob" className="flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            VOB
          </TabsTrigger>
        </TabsList>
        <TabsContent value="info" className="p-6">
          <div className="space-y-4">
            {!isEditable && (
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
                        value={formData.first_name}
                        onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                        className="mt-1"
                        disabled={!isEditable}
                      />
                    </div>
                    <div>
                      <Label htmlFor="last_name">Last Name</Label>
                      <Input
                        id="last_name"
                        value={formData.last_name}
                        onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                        className="mt-1"
                        disabled={!isEditable}
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        className="mt-1"
                        disabled={!isEditable}
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                        className="mt-1"
                        disabled={!isEditable}
                      />
                    </div>
                    {formData.lead_type === 'referral_partner' && (
                      <div>
                        <Label htmlFor="linkedin">LinkedIn</Label>
                        <Input
                          id="linkedin"
                          value={customer?.linkedin || ''}
                          onChange={(e) => setEditedCustomer(prev => ({ ...prev!, linkedin: e.target.value }))}
                          className="mt-1"
                          disabled={!isEditable}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Company Information */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Company Information</h3>
                  <div className="space-y-4">
                    {formData.lead_type === 'referral_partner' && (
                      <div>
                        <Label htmlFor="company">Company</Label>
                        <div className="mt-1">
                          <ReferralPartnerCompanyCombobox
                            companies={companies}
                            value={formData.company_id}
                            onChange={(value) => {
                              console.log('CompanyCombobox onChange:', value);
                              setFormData(prev => ({ ...prev, company_id: value }));
                            }}
                            disabled={!isEditable}
                          />
                        </div>
                      </div>
                    )}
                    {formData.lead_type === 'potential_customer' && (
                      <div>
                        <Label htmlFor="referring_user">Referring User</Label>
                        <div className="mt-1">
                          <Select
                            value={formData.referring_user_id || ""}
                            onValueChange={(value) => {
                              setFormData(prev => ({ 
                                ...prev, 
                                referring_user_id: value,
                                referrer_id: value
                              }))
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select referring user" />
                            </SelectTrigger>
                            <SelectContent>
                              {referringUsers.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {[user.first_name, user.last_name].filter(Boolean).join(' ') || user.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                    <div>
                      <Label htmlFor="position">Position</Label>
                      <Input
                        id="position"
                        value={formData.position}
                        onChange={(e) => setFormData(prev => ({ ...prev, position: e.target.value }))}
                        className="mt-1"
                        disabled={!isEditable}
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
                    <div>
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={formData.status}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, status: value as UserStatus }))}
                        disabled={!isEditable}
                      >
                        <SelectTrigger id="status" className="mt-1">
                          <SelectValue>
                            {formData.status === 'won' 
                              ? 'Won'
                              : formData.status === 'lost'
                                ? 'Lost'
                                : formData.status?.split('_')
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
                      <OwnerCombobox
                        owners={agents}
                        value={formData.owner_id}
                        onChange={(value) => setFormData(prev => ({ ...prev, owner_id: value }))}
                        disabled={!isEditable}
                      />
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
                      value={formData.notes}
                      onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      className="mt-1 h-32"
                      disabled={!isEditable}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* B2C Lead Information */}
            {customer?.lead_type === 'potential_customer' && (
              <div className="mt-8 border-t pt-8">
                <h3 className="text-lg font-semibold mb-4">Patient Information</h3>
                {isLoadingB2CInfo ? (
                  <p>Loading patient information...</p>
                ) : (
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="address">Address</Label>
                        <Input
                          id="address"
                          value={b2cLeadInfo?.address || ''}
                          onChange={(e) => setB2cLeadInfo(prev => ({ ...prev!, address: e.target.value }))}
                          className="mt-1"
                          disabled={!isEditable}
                        />
                      </div>
                      <div>
                        <Label htmlFor="gender">Gender</Label>
                        <Select
                          value={b2cLeadInfo?.gender || ''}
                          onValueChange={(value: 'Male' | 'Female' | 'Non-binary' | 'Other' | 'Prefer not to say') => 
                            setB2cLeadInfo(prev => ({ ...prev!, gender: value }))
                          }
                        >
                          <SelectTrigger id="gender" className="mt-1">
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Male">Male</SelectItem>
                            <SelectItem value="Female">Female</SelectItem>
                            <SelectItem value="Non-binary">Non-binary</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                            <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="ssn_last_four">SSN Last 4</Label>
                        <Input
                          id="ssn_last_four"
                          value={b2cLeadInfo?.ssn_last_four || ''}
                          onChange={(e) => setB2cLeadInfo(prev => ({ ...prev!, ssn_last_four: e.target.value }))}
                          className="mt-1"
                          maxLength={4}
                          disabled={!isEditable}
                        />
                      </div>
                      <div>
                        <Label htmlFor="dob">Date of Birth</Label>
                        <Input
                          id="dob"
                          type="date"
                          value={b2cLeadInfo?.dob || ''}
                          onChange={(e) => setB2cLeadInfo(prev => ({ ...prev!, dob: e.target.value }))}
                          className="mt-1"
                          disabled={!isEditable}
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="marital_status">Marital Status</Label>
                        <Select
                          value={b2cLeadInfo?.marital_status || ''}
                          onValueChange={(value: 'Single' | 'Married' | 'Divorced' | 'Widowed') => 
                            setB2cLeadInfo(prev => ({ ...prev!, marital_status: value }))
                          }
                        >
                          <SelectTrigger id="marital_status" className="mt-1">
                            <SelectValue placeholder="Select marital status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Single">Single</SelectItem>
                            <SelectItem value="Married">Married</SelectItem>
                            <SelectItem value="Divorced">Divorced</SelectItem>
                            <SelectItem value="Widowed">Widowed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="parental_status">Parental Status</Label>
                        <Select
                          value={b2cLeadInfo?.parental_status || ''}
                          onValueChange={(value: 'Has children' | 'No children') => 
                            setB2cLeadInfo(prev => ({ ...prev!, parental_status: value }))
                          }
                        >
                          <SelectTrigger id="parental_status" className="mt-1">
                            <SelectValue placeholder="Select parental status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Has children">Has children</SelectItem>
                            <SelectItem value="No children">No children</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="referral_source">Referral Source</Label>
                        <Input
                          id="referral_source"
                          value={b2cLeadInfo?.referral_source || ''}
                          onChange={(e) => setB2cLeadInfo(prev => ({ ...prev!, referral_source: e.target.value }))}
                          className="mt-1"
                          disabled={!isEditable}
                        />
                      </div>
                      <div>
                        <Label htmlFor="headshot_url">Headshot URL</Label>
                        <Input
                          id="headshot_url"
                          value={b2cLeadInfo?.headshot_url || ''}
                          onChange={(e) => setB2cLeadInfo(prev => ({ ...prev!, headshot_url: e.target.value }))}
                          className="mt-1"
                          disabled={!isEditable}
                          placeholder="https://example.com/image.jpg"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end space-x-2 mt-4">
              {isEditable && (
                <>
                  <Button variant="outline" onClick={() => {
                    setFormData({
                      first_name: customer?.first_name || "",
                      last_name: customer?.last_name || "",
                      email: customer?.email || "",
                      phone: customer?.phone || "",
                      position: customer?.position || "",
                      role: customer?.role || "lead",
                      status: customer?.status || "new",
                      owner_id: customer?.owner_id || null,
                      notes: customer?.notes || "",
                      lead_type: customer?.lead_type || null,
                      company_id: customer?.company_id || null,
                      referrer_id: customer?.referring_user_id || null,
                      referring_user_id: customer?.referring_user_id || null,
                    });
                    if (customer?.lead_type === 'potential_customer') {
                      loadB2CLeadInfo();
                    }
                  }}>
                    Reset Changes
                  </Button>
                  <Button onClick={() => {
                    handleSaveCustomer();
                    if (customer?.lead_type === 'potential_customer') {
                      handleSaveB2CLeadInfo();
                    }
                  }} disabled={loading}>
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
                  <div className="mt-4">
                    <MessageInput
                      value={responseMessage}
                      onChange={setResponseMessage}
                      onSubmit={handleSendResponse}
                      placeholder="Type your response... (Press / to use templates)"
                      customer={customer}
                      className="mt-2"
                      responseChannel={responseChannel}
                      onResponseChannelChange={setResponseChannel}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="vob" className="p-6">
          <VOBForm userId={id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}