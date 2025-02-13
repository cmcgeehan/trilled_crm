"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Database } from "@/types/supabase"
import { cn } from "@/lib/utils"
import { toast } from "react-hot-toast"

type User = Omit<Database['public']['Tables']['users']['Row'], 'status'> & {
  status: UserStatus,
  company_name?: string | null
}
type UserStatus = 'needs_response' | 'new' | 'follow_up' | 'won' | 'lost'

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
  const [dataLoading, setDataLoading] = useState(true)
  const [leads, setLeads] = useState<User[]>([])
  const [stats, setStats] = useState({
    openLeads: 0,
    wonLeads: 0,
    conversionRate: 0,
  })
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null)
  const [userContextLoaded, setUserContextLoaded] = useState(false)

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

        setUserContextLoaded(true)
        setLoading(false)
      } catch (error) {
        console.error('Error checking session:', error)
        router.replace('/login')
      }
    }

    checkSession()
  }, [router])

  const fetchStats = useCallback(async () => {
    setDataLoading(true)
    try {
      let query = supabase
        .from('users')
        .select('status')
        .is('deleted_at', null)

      if (currentUserRole !== 'super_admin') {
        query = query.eq('organization_id', currentOrganizationId)
      } else if (currentOrganizationId) {
        query = query.eq('organization_id', currentOrganizationId)
      }

      const { data, error } = await query
      if (error) throw error

      const statusCounts = data.reduce((acc: Record<string, number>, user) => {
        acc[user.status] = (acc[user.status] || 0) + 1
        return acc
      }, {})

      const openLeads = (statusCounts['needs_response'] || 0) + (statusCounts['follow_up'] || 0)
      const wonLeads = statusCounts['won'] || 0
      const lostLeads = statusCounts['lost'] || 0
      const totalClosedLeads = wonLeads + lostLeads
      const conversionRate = totalClosedLeads > 0 ? (wonLeads / totalClosedLeads) * 100 : 0

      setStats({
        openLeads,
        wonLeads,
        conversionRate,
      })
    } catch (error) {
      console.error('Error fetching stats:', error)
      toast.error('Failed to fetch stats')
    } finally {
      setDataLoading(false)
    }
  }, [currentUserRole, currentOrganizationId])

  const fetchLeads = useCallback(async () => {
    try {
      let query = supabase
        .from('users')
        .select('*')
        .in('status', ['needs_response', 'follow_up'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (currentUserRole !== 'super_admin') {
        query = query.eq('organization_id', currentOrganizationId)
      } else if (currentOrganizationId) {
        query = query.eq('organization_id', currentOrganizationId)
      }

      const { data, error } = await query
      if (error) throw error
      setLeads(data || [])
    } catch (error) {
      console.error('Error fetching leads:', error)
      toast.error('Failed to fetch leads')
    }
  }, [currentUserRole, currentOrganizationId])

  useEffect(() => {
    if (userContextLoaded) {
      fetchStats()
      fetchLeads()
    }
  }, [userContextLoaded, fetchStats, fetchLeads])

  if (loading || dataLoading || !userContextLoaded) {
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

