"use client"

import { useState, useEffect, useRef } from "react"
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

// Helper function to calculate follow-up dates
const calculateFollowUpDates = (createdDate: Date, isLead: boolean) => {
  const dates = []
  const day = 24 * 60 * 60 * 1000 // milliseconds in a day
  let currentDate = new Date(createdDate)

  // Add past dates
  for (let i = -30; i < 0; i += 7) {
    dates.push(new Date(currentDate.getTime() + i * day))
  }

  if (isLead) {
    const intervals = [1, 2, 4, 7, 10, 14]
    for (const interval of intervals) {
      currentDate = new Date(createdDate.getTime() + interval * day)
      dates.push(new Date(currentDate))
    }
    // Every 14 days following
    while (dates.length < 40) {
      currentDate = new Date(currentDate.getTime() + 14 * day)
      dates.push(new Date(currentDate))
    }
  } else {
    const intervals = [14, 28, 42, 56, 70]
    for (const interval of intervals) {
      currentDate = new Date(createdDate.getTime() + interval * day)
      dates.push(new Date(currentDate))
    }
    // Every 30 days following
    while (dates.length < 40) {
      currentDate = new Date(currentDate.getTime() + 30 * day)
      dates.push(new Date(currentDate))
    }
  }

  return dates.sort((a, b) => a.getTime() - b.getTime())
}

// Updated mock data with more recent creation dates
const customers = [
  {
    id: 1,
    name: "John Doe",
    phone: "123-456-7890",
    email: "john@example.com",
    isLead: true,
    status: "New",
    owner: "Jane Smith",
    createdAt: new Date("2023-07-15"), // More recent date
    cases: [
      {
        id: 1,
        status: "Needs Action",
        createdAt: "2023-07-15",
        type: "IT",
        interactions: [
          {
            type: "email",
            date: "2023-07-15",
            content: "Hello, I'm having trouble with my account. Can you help?",
            sender: "customer",
          },
          {
            type: "email",
            date: "2023-07-15",
            content: "I'd be happy to assist you. What specific issue are you experiencing?",
            sender: "agent",
            agentName: "Jane Smith",
          },
          {
            type: "call",
            date: "2023-07-16",
            content: "Walked through account recovery process",
            duration: "15:30",
            recordingUrl: "#",
            agentName: "John Doe",
          },
        ],
      },
    ],
  },
  {
    id: 2,
    name: "Jane Smith",
    phone: "987-654-3210",
    email: "jane@example.com",
    isLead: false,
    status: "Active",
    owner: "Mike Johnson",
    createdAt: new Date("2023-07-01"), // More recent date
    cases: [
      {
        id: 2,
        status: "In Progress",
        createdAt: "2023-07-05",
        type: "Billing",
        interactions: [
          {
            type: "email",
            date: "2023-07-05",
            content: "I have a question about my recent invoice. Can you clarify the charges?",
            sender: "customer",
          },
          {
            type: "call",
            date: "2023-07-06",
            content: "Explained the billing details and resolved the customer's concerns",
            duration: "10:15",
            recordingUrl: "#",
            agentName: "Mike Johnson",
          },
        ],
      },
    ],
  },
  {
    id: 3,
    name: "Alice Johnson",
    phone: "555-123-4567",
    email: "alice@example.com",
    isLead: true,
    status: "New",
    owner: "Sarah Brown",
    createdAt: new Date("2023-07-20"), // Very recent date
    cases: [
      {
        id: 3,
        status: "New",
        createdAt: "2023-07-20",
        type: "Sales",
        interactions: [
          {
            type: "email",
            date: "2023-07-20",
            content: "I'm interested in your product. Can you provide more information?",
            sender: "customer",
          },
        ],
      },
    ],
  },
]

const lostReasons = [
  { id: "budget", label: "Budget constraints" },
  { id: "competitor", label: "Chose a competitor" },
  { id: "timing", label: "Bad timing" },
  { id: "needs", label: "Needs not met" },
  { id: "other", label: "Other" },
]

const caseTypes = [
  { id: "technical", label: "IT" },
  { id: "billing", label: "Billing" },
  { id: "sales", label: "Sales" },
  { id: "complaint", label: "Complaint" },
  { id: "feature", label: "Feature" },
]

const followUpTypes = [
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "tour", label: "Tour" },
]

type FollowUp = {
  date: Date
  type: string
  completed: boolean
}

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState("info")
  const [customer, setCustomer] = useState(customers[0])
  const [activeCase, setActiveCase] = useState(customer.cases[0])
  const [responseChannel, setResponseChannel] = useState("email")
  const [responseMessage, setResponseMessage] = useState("")
  const [editedCustomer, setEditedCustomer] = useState(customer)
  const [isEditing, setIsEditing] = useState(false)
  const [isMarkingAsLost, setIsMarkingAsLost] = useState(false)
  const [lostReason, setLostReason] = useState("")
  const [otherReason, setOtherReason] = useState("")
  const [expandedFollowUp, setExpandedFollowUp] = useState<number | null>(null)
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [nextFollowUp, setNextFollowUp] = useState<FollowUp | null>(null)

  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const customerId = Number.parseInt(params.id)
    const selectedCustomer = customers.find((c) => c.id === customerId) || customers[0]
    setCustomer(selectedCustomer)
    setEditedCustomer(selectedCustomer)
    setActiveCase(selectedCustomer.cases[0])
  }, [params.id])

  useEffect(() => {
    const tab = searchParams.get("tab")
    if (tab === "cases") {
      setActiveTab("cases")
    }
  }, [searchParams])

  useEffect(() => {
    const dates = calculateFollowUpDates(editedCustomer.createdAt, editedCustomer.isLead)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const newFollowUps = dates.map((date) => ({
      date,
      type: "email",
      completed: date < today,
    }))

    // Find the index of the most recent completed follow-up
    const lastCompletedIndex = newFollowUps.reduce((lastIndex, followUp, index) => {
      return followUp.completed ? index : lastIndex
    }, -1)

    // Slice the array to include only the most recent completed follow-up and upcoming ones
    const displayedFollowUps = newFollowUps.slice(Math.max(0, lastCompletedIndex))

    setFollowUps(displayedFollowUps)

    // Set the next follow-up
    const nextFollowUpIndex = displayedFollowUps.findIndex((fu) => !fu.completed)
    if (nextFollowUpIndex !== -1) {
      setNextFollowUp(displayedFollowUps[nextFollowUpIndex])
      setExpandedFollowUp(nextFollowUpIndex)
    } else {
      setNextFollowUp(null)
      setExpandedFollowUp(null)
    }
  }, [editedCustomer.createdAt, editedCustomer.isLead])

  useEffect(() => {
    if (scrollContainerRef.current) {
      const scrollContainer = scrollContainerRef.current
      const nextFollowUpIndex = followUps.findIndex((fu) => !fu.completed)
      const scrollToIndex = Math.max(0, nextFollowUpIndex - 1) // Show 1 past date if available
      scrollContainer.scrollLeft = scrollToIndex * 120 // Adjust based on your date item width
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

  const handleSaveCustomer = () => {
    console.log("Saving customer:", editedCustomer)
    setIsEditing(false)
  }

  const handleClickToDial = () => {
    console.log(`Initiating call to ${customer.phone}`)
  }

  const handleMarkAsLost = () => {
    const finalReason = lostReason === "other" ? otherReason : lostReason
    console.log(`Marking lead as lost. Reason: ${finalReason}`)
    setIsMarkingAsLost(false)
    // Here you would typically update the customer status in your backend
    setEditedCustomer({ ...editedCustomer, status: "Lost" })
  }

  const handleExpandFollowUp = (index: number) => {
    setExpandedFollowUp((prev) => (prev === index ? null : index))
  }

  const handleUpdateFollowUp = (index: number, updates: Partial<FollowUp>) => {
    const updatedFollowUps = [...followUps]
    updatedFollowUps[index] = { ...updatedFollowUps[index], ...updates }

    // If the date has changed, we need to re-sort the array
    if (updates.date) {
      updatedFollowUps.sort((a, b) => a.date.getTime() - b.date.getTime())
    }

    setFollowUps(updatedFollowUps)
    setExpandedFollowUp(null)

    // Update the next follow-up if necessary
    const nextFollowUpIndex = updatedFollowUps.findIndex((fu) => !fu.completed)
    if (nextFollowUpIndex !== -1) {
      setNextFollowUp(updatedFollowUps[nextFollowUpIndex])
    } else {
      setNextFollowUp(null)
    }
  }

  return (
    <div className="space-y-4 bg-gray-50 min-h-screen p-6">
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{editedCustomer.name}</h1>
            <p className="text-gray-500">
              {editedCustomer.isLead ? "Lead" : "Customer"} • {editedCustomer.status}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">
              <strong>Created:</strong> {editedCustomer.createdAt.toLocaleDateString()}
            </p>
            <p className="text-sm text-gray-500">
              <strong>Owner:</strong> {editedCustomer.owner}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Follow-up Sequence</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <div
                ref={scrollContainerRef}
                className="flex overflow-x-auto space-x-4 p-4 scrollbar-hide"
                style={{ scrollBehavior: "smooth" }}
              >
                {followUps.map((followUp, index) => (
                  <div key={index} className="relative">
                    <div
                      className={`flex-shrink-0 flex flex-col items-center justify-center w-28 h-28 border rounded-md cursor-pointer
                        ${expandedFollowUp === index ? "bg-blue-100 border-blue-500" : "bg-white"}
                        ${followUp.completed ? "opacity-50" : ""}`}
                      onClick={() => handleExpandFollowUp(index)}
                    >
                      <Calendar
                        className={`h-6 w-6 ${expandedFollowUp === index ? "text-blue-500" : "text-gray-500"}`}
                      />
                      <span className="text-sm font-medium">{followUp.date.toLocaleDateString()}</span>
                      <Badge variant="secondary" className="mt-1">
                        {followUp.type}
                      </Badge>
                      {followUp.completed && <Check className="text-green-500 mt-1" />}
                    </div>
                    {expandedFollowUp === index && (
                      <Card className="absolute z-10 mt-2 w-64 left-0">
                        <CardContent className="p-4">
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="followup-type">Type</Label>
                              <Select
                                value={followUp.type}
                                onValueChange={(value) => handleUpdateFollowUp(index, { type: value })}
                              >
                                <SelectTrigger id="followup-type">
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
                            <div>
                              <Label htmlFor="followup-date">Date</Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant={"outline"} className={`w-full justify-start text-left font-normal`}>
                                    <Calendar className="mr-2 h-4 w-4" />
                                    {format(followUp.date, "PPP")}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                  <CalendarComponent
                                    mode="single"
                                    selected={followUp.date}
                                    onSelect={(date) => date && handleUpdateFollowUp(index, { date })}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id="followup-completed"
                                checked={followUp.completed}
                                onCheckedChange={(checked) =>
                                  handleUpdateFollowUp(index, { completed: checked as boolean })
                                }
                              />
                              <Label htmlFor="followup-completed">Completed</Label>
                            </div>
                            <Button onClick={() => setExpandedFollowUp(null)}>Close</Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="absolute left-0 top-1/2 transform -translate-y-1/2"
                onClick={() => {
                  if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollLeft -= 120 // Scroll 1 item left
                  }
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="absolute right-0 top-1/2 transform -translate-y-1/2"
                onClick={() => {
                  if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollLeft += 120 // Scroll 1 item right
                  }
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next Follow-up</CardTitle>
          </CardHeader>
          <CardContent>
            {nextFollowUp ? (
              <div className="space-y-4">
                <div>
                  <Label>Date</Label>
                  <p className="text-lg font-medium">{format(nextFollowUp.date, "PPP")}</p>
                </div>
                <div>
                  <Label>Type</Label>
                  <p className="text-lg font-medium">{nextFollowUp.type}</p>
                </div>
                <Button
                  className="w-full"
                  onClick={() => handleUpdateFollowUp(followUps.indexOf(nextFollowUp), { completed: true })}
                >
                  Mark as Completed
                </Button>
              </div>
            ) : (
              <p>No upcoming follow-ups scheduled.</p>
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
              <strong>Name:</strong> {editedCustomer.name}
            </p>
            <p>
              <strong>Phone:</strong> {editedCustomer.phone}
            </p>
            <p>
              <strong>Email:</strong> {editedCustomer.email}
            </p>
            <p>
              <strong>Type:</strong> {editedCustomer.isLead ? "Lead" : "Customer"}
            </p>
            <p>
              <strong>Status:</strong> {editedCustomer.status}
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
                        value={editedCustomer.name}
                        onChange={(e) => setEditedCustomer({ ...editedCustomer, name: e.target.value })}
                        className="col-span-3"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="phone" className="text-right">
                        Phone
                      </Label>
                      <Input
                        id="phone"
                        value={editedCustomer.phone}
                        onChange={(e) => setEditedCustomer({ ...editedCustomer, phone: e.target.value })}
                        className="col-span-3"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="email" className="text-right">
                        Email
                      </Label>
                      <Input
                        id="email"
                        value={editedCustomer.email}
                        onChange={(e) => setEditedCustomer({ ...editedCustomer, email: e.target.value })}
                        className="col-span-3"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="owner" className="text-right">
                        Owner
                      </Label>
                      <Input
                        id="owner"
                        value={editedCustomer.owner}
                        onChange={(e) => setEditedCustomer({ ...editedCustomer, owner: e.target.value })}
                        className="col-span-3"
                      />
                    </div>
                  </div>
                  <Button onClick={handleSaveCustomer}>Save Changes</Button>
                </DialogContent>
              </Dialog>
              {editedCustomer.isLead && editedCustomer.status !== "Lost" && (
                <Dialog open={isMarkingAsLost} onOpenChange={setIsMarkingAsLost}>
                  <DialogTrigger asChild>
                    <Button variant="destructive">
                      <AlertTriangle className="mr-2 h-4 w-4" /> Mark as Lost
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
              {customer.cases.map((c) => (
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
                            <p>Duration: {interaction.duration}</p>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="mt-2">
                          <Play className="mr-2 h-4 w-4" /> Play Recording
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {interaction.sender === "customer" && (
                          <p className="text-xs text-gray-500">
                            {interaction.type === "email"
                              ? customer.email
                              : interaction.type === "sms"
                                ? customer.phone
                                : ""}
                          </p>
                        )}
                        {interaction.sender === "agent" && (
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
                        <p className="text-sm text-muted-foreground">Initiate a call to {customer.phone}</p>
                      </div>
                      <Button onClick={handleClickToDial}>
                        <Phone className="mr-2 h-4 w-4" /> Call {customer.name}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

