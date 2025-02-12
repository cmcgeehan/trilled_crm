"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Database } from "@/types/supabase"
import { cn } from "@/lib/utils"

type User = Omit<Database['public']['Tables']['users']['Row'], 'status'> & {
  status: UserStatus,
  company_name?: string | null
}
type UserStatus = 'needs_response' | 'new' | 'follow_up' | 'won' | 'lost'

const ACTIVE_STATUSES = ['needs_response', 'new', 'follow_up'] as const

const STATUS_PRIORITY: Record<UserStatus, number> = {
  'needs_response': 0,
  'new': 1,
  'follow_up': 2,
  'won': 3,
  'lost': 4,
}

const STATUS_STYLES: Record<UserStatus, { bg: string, text: string }> = {
  'needs_response': { bg: 'bg-brand-orange', text: 'text-white' },
  'new': { bg: 'bg-brand-lightBlue', text: 'text-white' },
  'follow_up': { bg: 'bg-brand-darkBlue', text: 'text-brand-white' },
  'won': { bg: 'bg-brand-lightBlue', text: 'text-brand-darkBlue' },
  'lost': { bg: 'bg-brand-darkRed', text: 'text-brand-white' },
}

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [leads, setLeads] = useState<User[]>([])
  const [stats, setStats] = useState({
    openLeads: 0,
    wonLeads: 0,
    conversionRate: 0,
  })

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          console.log('No session found in dashboard, redirecting to login')
          router.replace('/login')
          return
        }
        console.log('Session found in dashboard:', session.user.email)
        setLoading(false)
        
        // Fetch initial data
        fetchLeads()
        fetchStats()

        // Set up real-time subscriptions
        const channel = supabase.channel('users-changes')
        
        channel
          .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'users' },
            () => {
              fetchLeads()
              fetchStats()
            }
          )
          .subscribe(async (status, err) => {
            if (status === 'SUBSCRIBED') {
              console.log('Successfully subscribed to changes')
            }
            if (status === 'CHANNEL_ERROR') {
              console.error('Channel error:', err)
              console.log('Attempting to reconnect...')
              await channel.unsubscribe()
              channel.subscribe()
            }
          })

        return () => {
          channel.unsubscribe()
        }
      } catch (error) {
        console.error('Error checking session:', error)
        router.replace('/login')
      }
    }

    checkSession()
  }, [router])

  const fetchStats = async () => {
    // Get open leads count (not won or lost)
    const { count: openLeadsCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'lead')
      .not('status', 'in', '(won,lost)')
      .is('deleted_at', null)

    // Get won leads count
    const { count: wonLeadsCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'lead')
      .eq('status', 'won')
      .is('deleted_at', null)

    // Get total closed leads (won + lost) for conversion rate
    const { count: totalClosedLeads } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'lead')
      .in('status', ['won', 'lost'])
      .is('deleted_at', null)

    const conversionRate = totalClosedLeads && wonLeadsCount ? (wonLeadsCount / totalClosedLeads) * 100 : 0

    setStats({
      openLeads: openLeadsCount || 0,
      wonLeads: wonLeadsCount || 0,
      conversionRate,
    })
  }

  const fetchLeads = async () => {
    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        companies (
          name
        ),
        position
      `)
      .eq('role', 'lead')
      .in('status', ACTIVE_STATUSES)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Error fetching leads:', error)
      return
    }

    console.log('Raw leads data:', data)
    console.log('Companies data from leads:', data?.map(d => d.companies))

    // Sort leads by status priority and ensure correct typing
    const sortedLeads = [...(data || [])].map(lead => ({
      ...lead,
      status: lead.status as UserStatus,
      company_name: lead.companies?.name
    })).sort((a, b) => {
      return STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]
    })

    console.log('Processed leads with companies:', sortedLeads)
    setLeads(sortedLeads)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Open Leads</p>
              <p className="text-3xl font-bold">{stats.openLeads}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Won Leads</p>
              <p className="text-3xl font-bold">{stats.wonLeads}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Conversion Rate</p>
              <p className="text-3xl font-bold">{stats.conversionRate.toFixed(1)}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between items-center border-b border-brand-darkBlue pb-4">
        <h1 className="text-2xl font-bold text-brand-darkBlue">My Queue</h1>
        <Button 
          asChild
          className="bg-brand-darkBlue hover:bg-brand-darkBlue/90 text-white border-0"
        >
          <Link href="/users/new">Add Lead</Link>
        </Button>
      </div>
      <div className="space-y-4">
        {leads.length === 0 ? (
          <Card>
            <CardContent className="p-4">
              <p className="text-gray-500 text-center">No leads in your queue</p>
            </CardContent>
          </Card>
        ) : (
          leads.map((lead) => (
            <Card key={lead.id}>
              <CardContent className="flex justify-between items-center p-4">
                <div>
                  <p className="font-semibold text-brand-darkBlue">{lead.first_name} {lead.last_name}</p>
                  <p className="text-sm text-brand-darkBlue/70">
                    {lead.company_name && <span>{lead.company_name}</span>}
                    {lead.company_name && lead.position && <span> · </span>}
                    {lead.position && <span>{lead.position}</span>}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <div 
                    className={cn(
                      "rounded-full px-3 py-1 text-sm font-medium",
                      STATUS_STYLES[lead.status].bg,
                      STATUS_STYLES[lead.status].text
                    )}
                  >
                    {lead.status.split('_').map(word => 
                      word.charAt(0).toUpperCase() + word.slice(1)
                    ).join(' ')}
                  </div>
                  <Button 
                    asChild 
                    variant="outline" 
                    size="sm"
                    className="border-brand-darkBlue text-brand-darkBlue hover:bg-brand-darkBlue hover:text-brand-white"
                  >
                    <Link href={`/users/${lead.id}`}>View Lead</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

