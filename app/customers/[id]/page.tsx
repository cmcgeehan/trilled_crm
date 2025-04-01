"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Play, Send, Edit, Phone, AlertTriangle, Calendar, ChevronLeft, ChevronRight, Check } from "lucide-react"
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
import { use } from "react"
import { toast } from "react-hot-toast"
import { Calendar as CalendarIcon } from "lucide-react"

type UserStatus = Database['public']['Tables']['users']['Row']['status']
type UserRole = Database['public']['Tables']['users']['Row']['role']

type Agent = {
  id: string;
  email: string | null;
}

type Customer = Database['public']['Tables']['users']['Row'] & {
  name?: string;
  company?: string | null;
  lost_at?: string | null;
  lost_reason?: string | null;
}

type FollowUpType = Database['public']['Tables']['follow_ups']['Row']['type']

type FollowUp = {
  id: string
  user_id: string
  type: FollowUpType
  date: string
  completed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  next_follow_up_id: string | null
}

type Case = {
  id: number;
  status: string;
  createdAt: string;
  type: string;
  interactions: Array<{
    type: string;
    date: string;
    content: string;
    sender: 'customer' | 'agent';
    duration?: string;
    recordingUrl?: string;
    agentName?: string;
  }>;
}

// Helper function to get the day difference between two dates
const getDayDifference = (date1: Date, date2: Date) => {
  const diffTime = Math.abs(date2.getTime() - date1.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

// Helper function to get the sequence day for a follow-up
const getSequenceDay = (followUpDate: Date, createdDate: Date) => {
  return getDayDifference(new Date(createdDate), new Date(followUpDate))
}

// Get the expected sequence based on role
const getExpectedSequence = (role: 'lead' | 'customer') => {
  return role === 'lead'
    ? [1, 2, 4, 7, 10, 14, 28]
    : [14, 28, 42, 56, 70, 90, 120, 150, 180]
}

const formatDateSafe = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '-'
  try {
    const date = new Date(dateStr)
    return format(date, 'MMM d, yyyy h:mm a')
  } catch {
    return '-'
  }
}

const lostReasons = [
  { id: "budget", label: "Budget constraints" },
  { id: "competitor", label: "Chose a competitor" },
  { id: "timing", label: "Bad timing" },
  { id: "needs", label: "Needs not met" },
  { id: "other", label: "Other" },
]

const followUpTypes = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "tour", label: "Tour" },
] as const

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = use(params).id
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState("info")
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCase, setActiveCase] = useState<Case | null>(null)
  const [cases, setCases] = useState<Case[]>([])
  const [responseChannel, setResponseChannel] = useState("email")
  const [responseMessage, setResponseMessage] = useState("")
  const [editedCustomer, setEditedCustomer] = useState<Customer | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isMarkingAsLost, setIsMarkingAsLost] = useState(false)
  const [lostReason, setLostReason] = useState<string | null>(null)
  const [otherReason, setOtherReason] = useState<string>("")
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUp | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [isUpdatingFollowUps, setIsUpdatingFollowUps] = useState(false)

  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const loadFollowUps = useCallback(async () => {
    if (!customer?.id) return

    try {
      const { data: followUps, error } = await supabase
        .from('follow_ups')
        .select('*')
        .eq('user_id', customer.id)
        .is('deleted_at', null)
        .order('date', { ascending: true })

      if (error) {
        console.error('Error loading follow-ups:', error)
        return
      }

      setFollowUps(followUps || [])
    } catch (error) {
      console.error('Error loading follow-ups:', error)
    }
  }, [customer?.id])

  const loadCustomer = useCallback(async () => {
    try {
      setLoading(true)
      const { data: userData, error: fetchError } = await supabase
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

      if (!userData) {
        throw new Error('Customer not found')
      }

      const customer: Customer = {
        ...userData,
        name: userData.first_name && userData.last_name ? `${userData.first_name} ${userData.last_name}` : userData.first_name || userData.last_name || undefined,
        company: userData.companies?.name || undefined
      }

      setCustomer(customer)
      setEditedCustomer(customer)
      
      // For now, we'll use mock cases until we implement the cases table
      const mockCase: Case = {
        id: 1,
        status: "New",
        createdAt: new Date().toISOString(),
        type: "Sales",
        interactions: []
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

  const loadAgents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email')
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
  }, [loadCustomer, loadAgents])

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

  const handleSendResponse = () => {
    if (responseChannel === "internal") {
      console.log(`Adding internal note: ${responseMessage}`)
    } else {
      console.log(`Sending ${responseChannel} response: ${responseMessage}`)
    }
    setResponseMessage("")
  }

  const handleSaveCustomer = async () => {
    if (!editedCustomer) return
    await handleUpdateCustomer(editedCustomer)
    setIsEditing(false)
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

  const handleSelectFollowUp = (followUp: FollowUp) => {
    if (!isUpdatingFollowUps) {
      setSelectedFollowUp(followUp)
    }
  }

  const handleUpdateFollowUp = async (updates: Partial<FollowUp>) => {
    if (!selectedFollowUp) return

    setIsUpdatingFollowUps(true)
    setError(null)

    try {
      const updateData: Partial<FollowUp> = {
        type: updates.type,
        notes: updates.notes,
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
          .gt('date', selectedFollowUp?.date || '')
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
        .eq('id', selectedFollowUp.id)

      if (error) throw error

      // Refresh the follow-ups list
      await loadFollowUps()
    } catch (err) {
      console.error('Error updating follow-up:', err)
      setError('Failed to update follow-up')
    } finally {
      setIsUpdatingFollowUps(false)
    }
  }

  const handleStatusChange = (newStatus: UserStatus) => {
    if (!editedCustomer) return

    setEditedCustomer(prev => {
      if (!prev) return null
      return {
        ...prev,
        status: newStatus,
        lost_reason: newStatus === 'lost' ? 'Status changed manually' : null,
        lost_at: newStatus === 'lost' ? new Date().toISOString() : null
      }
    })
  }

  const handleOwnerChange = (ownerId: string | null) => {
    if (!editedCustomer) return

    setEditedCustomer(prev => {
      if (!prev) return null
      return {
        ...prev,
        owner_id: ownerId
      }
    })
  }

  const handleUpdateCustomer = useCallback(async (updates: Partial<Database['public']['Tables']['users']['Update']>) => {
    if (!customer) return
    setLoading(true)
    try {
      const { data: updatedCustomer, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', customer.id)
        .select()
        .single()

      if (error) throw error
      if (!updatedCustomer) throw new Error('Customer not found')

      setCustomer(prev => prev ? { ...prev, ...updatedCustomer } : null)
      toast.success('Customer updated successfully')
    } catch (error) {
      console.error('Error updating customer:', error)
      toast.error('Failed to update customer')
    } finally {
      setLoading(false)
    }
  }, [customer])

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
        <p className="text-red-500">Error: {error || 'Customer not found'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 bg-gray-50 min-h-screen p-6">
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{customer?.name}</h1>
            <p className="text-gray-500">
              Customer • {customer?.company || 'No Company'} • {customer?.status === 'lost' ? 'Lost' : 'Active'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">
              <strong>Created:</strong> {customer?.created_at ? new Date(customer.created_at).toLocaleDateString() : '-'}
            </p>
            <p className="text-sm text-gray-500">
              <strong>Email:</strong> {customer?.email || '-'}
            </p>
            {customer?.status === 'lost' && (
              <p className="text-sm text-gray-500">
                <strong>Lost on:</strong> {customer?.lost_at ? new Date(customer.lost_at).toLocaleDateString() : '-'}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Follow-up Sequence</CardTitle>
            {customer && (
              <p className="text-sm text-gray-500">
                Based on {customer.role} creation date: {new Date(customer.created_at).toLocaleDateString()}
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
                  const followUpDate = followUp.date ? new Date(followUp.date) : null
                  const customerCreatedDate = customer?.created_at ? new Date(customer.created_at) : null
                  const sequenceDay = followUpDate && customerCreatedDate
                    ? getSequenceDay(followUpDate, customerCreatedDate)
                    : 0
                  
                  return (
                    <div
                      key={followUp.id}
                      className={`flex-shrink-0 flex flex-col items-center justify-center w-28 h-32 border rounded-md cursor-pointer
                        ${selectedFollowUp?.id === followUp.id ? "bg-blue-100 border-blue-500" : "bg-white"}
                        ${followUp.completed_at ? "opacity-50" : ""}
                        ${isUpdatingFollowUps ? "opacity-50 cursor-not-allowed" : ""}`}
                      onClick={() => !isUpdatingFollowUps && handleSelectFollowUp(followUp)}
                    >
                      <Calendar
                        className={`h-6 w-6 ${selectedFollowUp?.id === followUp.id ? "text-blue-500" : "text-gray-500"}`}
                      />
                      <span className="text-sm font-medium">
                        {followUpDate?.toLocaleDateString() || '-'}
                      </span>
                      <span className="text-xs text-gray-500">
                        Day {sequenceDay}
                      </span>
                      <Badge variant="secondary" className="mt-1">
                        {followUp.type}
                      </Badge>
                      {followUp.completed_at && <Check className="text-green-500 mt-1" />}
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
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formatDateSafe(selectedFollowUp?.date)}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <CalendarComponent
                        mode="single"
                        selected={selectedFollowUp?.date ? new Date(selectedFollowUp.date) : undefined}
                        onSelect={(date) => date && handleUpdateFollowUp({ date: date.toISOString() })}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label htmlFor="followup-type">Type</Label>
                  <Select
                    value={selectedFollowUp.type || undefined}
                    onValueChange={(value) => handleUpdateFollowUp({ type: value as string })}
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
                    checked={!!selectedFollowUp.completed_at}
                    onCheckedChange={(checked) => handleUpdateFollowUp({ completed_at: checked ? new Date().toISOString() : null })}
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

      <h2 className="text-xl font-semibold mt-6">Customer Details</h2>
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
          <div className="space-y-2">
            <p>
              <strong>Name:</strong> {customer?.name || '-'}
            </p>
            <p>
              <strong>Phone:</strong> {customer?.phone || '-'}
            </p>
            <p>
              <strong>Email:</strong> {customer?.email || '-'}
            </p>
            <p>
              <strong>Company:</strong> {customer?.company || '-'}
            </p>
            <p>
              <strong>Owner:</strong> {agents.find(a => a.id === customer?.owner_id)?.email || 'Unassigned'}
            </p>
            <p>
              <strong>Status:</strong> {customer?.status === 'lost' ? 'Lost' : 'Active'}
              {customer?.status === 'lost' && customer?.lost_reason && (
                <span className="text-gray-500 ml-2">
                  (Reason: {customer.lost_reason})
                </span>
              )}
            </p>
            <p>
              <strong>Notes:</strong> {customer?.notes || '-'}
            </p>
            <div className="flex space-x-2 mt-4">
              <Dialog open={isEditing} onOpenChange={setIsEditing}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Edit className="mr-2 h-4 w-4" /> Edit Customer
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Customer Information</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="name" className="text-right">
                        Name
                      </Label>
                      <Input
                        id="name"
                        value={editedCustomer?.name || ''}
                        onChange={(e) => setEditedCustomer(prev => ({ ...prev!, name: e.target.value }))}
                        className="col-span-3"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="phone" className="text-right">
                        Phone
                      </Label>
                      <Input
                        id="phone"
                        value={editedCustomer?.phone || ''}
                        onChange={(e) => setEditedCustomer(prev => ({ ...prev!, phone: e.target.value }))}
                        className="col-span-3"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="email" className="text-right">
                        Email
                      </Label>
                      <Input
                        id="email"
                        value={editedCustomer?.email || ''}
                        onChange={(e) => setEditedCustomer(prev => ({ ...prev!, email: e.target.value }))}
                        className="col-span-3"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="company" className="text-right">
                        Company
                      </Label>
                      <Input
                        id="company"
                        value={editedCustomer?.company || ''}
                        onChange={(e) => setEditedCustomer(prev => ({ ...prev!, company: e.target.value }))}
                        className="col-span-3"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="status" className="text-right">
                        Status
                      </Label>
                      <Select
                        value={editedCustomer.status}
                        onValueChange={(value: UserStatus) => handleStatusChange(value)}
                      >
                        <SelectTrigger id="status" className="col-span-3">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="needs_response">Needs Response</SelectItem>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="follow_up">Follow Up</SelectItem>
                          <SelectItem value="won">Won</SelectItem>
                          <SelectItem value="lost">Lost</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="notes" className="text-right">
                        Notes
                      </Label>
                      <Textarea
                        id="notes"
                        value={editedCustomer?.notes || ''}
                        onChange={(e) => setEditedCustomer(prev => ({ ...prev!, notes: e.target.value }))}
                        className="col-span-3"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="owner" className="text-right">
                        Owner
                      </Label>
                      <Select
                        value={editedCustomer?.owner_id || 'unassigned'}
                        onValueChange={(value: string) => handleOwnerChange(value === 'unassigned' ? null : value)}
                      >
                        <SelectTrigger id="owner" className="col-span-3">
                          <SelectValue placeholder="Select owner" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {agents.map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                              {agent.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="role" className="text-right">
                        Role
                      </Label>
                      <Select
                        value={editedCustomer.role}
                        onValueChange={(value) => setEditedCustomer(prev => ({ ...prev!, role: value as UserRole }))}
                      >
                        <SelectTrigger id="role" className="col-span-3">
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
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSaveCustomer}>Save Changes</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              {customer?.status !== 'lost' && (
                <Dialog open={isMarkingAsLost} onOpenChange={setIsMarkingAsLost}>
                  <DialogTrigger asChild>
                    <Button variant="destructive">
                      <AlertTriangle className="mr-2 h-4 w-4" /> Mark as Lost
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Mark Customer as Lost</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                      <Label htmlFor="lost-reason" className="mb-2 block">
                        Select a reason:
                      </Label>
                      <RadioGroup 
                        id="lost-reason" 
                        value={lostReason || ''} 
                        onValueChange={setLostReason}
                      >
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
        </TabsContent>
        <TabsContent value="cases" className="p-6">
          <div className="flex space-x-6">
            <div className="w-1/3 bg-gray-100 p-4 rounded-lg">
              <h2 className="text-lg font-semibold mb-4">Cases</h2>
              {cases.map((c) => (
                <Button
                  key={c.id}
                  variant={c === activeCase ? "default" : "outline"}
                  className={`w-full mb-2 justify-start items-center ${
                    c === activeCase ? "bg-blue-100 text-blue-800" : "bg-white"
                  }`}
                  onClick={() => setActiveCase(c)}
                >
                  <div className="flex justify-between items-center w-full">
                    <span>
                      Case {c.id} - {c.status}
                    </span>
                    <Badge
                      variant="secondary"
                      className={`ml-2 text-xs ${c === activeCase ? "bg-blue-200 text-blue-800" : ""}`}
                    >
                      {c.type}
                    </Badge>
                  </div>
                </Button>
              ))}
            </div>
            {activeCase && (
              <div className="w-2/3 space-y-4 bg-white p-6 rounded-lg shadow">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <h3 className="font-semibold text-blue-800">Case Information</h3>
                  <p className="text-blue-700">Created: {activeCase.createdAt}</p>
                  <p className="text-blue-700">Status: {activeCase.status}</p>
                  <div className="text-blue-700">
                    Type:{" "}
                    <Badge variant="outline" className="text-xs bg-blue-100">
                      {activeCase.type}
                    </Badge>
                  </div>
                </div>
                <h2 className="text-lg font-semibold">Interactions</h2>
                <div className="space-y-4 max-h-[400px] overflow-y-auto bg-gray-50 p-4 rounded-lg">
                  {activeCase.interactions.map((interaction, index) => (
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
                  ))}
                </div>
                <div className="flex space-x-2 bg-gray-100 p-4 rounded-lg">
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
                            Initiate a call to {customer?.phone || 'no phone number'}
                          </p>
                        </div>
                        <Button onClick={handleClickToDial}>
                          <Phone className="mr-2 h-4 w-4" /> Call {customer?.name || 'customer'}
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

