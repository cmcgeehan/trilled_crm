"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"

type UserStatus = 'needs_response' | 'new' | 'follow_up' | 'won' | 'lost'
type UserRole = 'lead' | 'customer' | 'agent' | 'admin' | 'super_admin'

type User = {
  id: string
  email: string
  first_name: string
  last_name: string
  role: UserRole
  status: UserStatus
  lead_type?: 'Referral Partner' | 'Potential Customer'
  company_id?: string
  referral_company_id?: string
  owner_id?: string
  created_at: string
  updated_at: string
  companies?: {
    id: string
    name: string
  }
}

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

const DEFAULT_STATUS_STYLE = { bg: 'bg-gray-100', text: 'text-gray-800' }

const LEAD_TYPE_BADGE_STYLES = {
  'Referral Partner': {
    bg: 'bg-brand-darkBlue',
    text: 'text-brand-white'
  },
  'Potential Customer': {
    bg: 'bg-brand-lightBlue',
    text: 'text-brand-darkBlue'
  }
} as const

const DEFAULT_LEAD_TYPE_STYLE = { bg: 'bg-gray-100', text: 'text-gray-800' }

const isValidStatus = (status: string): status is UserStatus => {
  return ['needs_response', 'new', 'follow_up', 'won', 'lost'].includes(status)
}

const getStatusStyle = (status: string) => {
  return isValidStatus(status) ? STATUS_STYLES[status] : DEFAULT_STATUS_STYLE
}

const isValidLeadType = (type: string): type is keyof typeof LEAD_TYPE_BADGE_STYLES => {
  return ['Referral Partner', 'Potential Customer'].includes(type)
}

const getLeadTypeStyle = (type: string) => {
  return isValidLeadType(type) ? LEAD_TYPE_BADGE_STYLES[type] : DEFAULT_LEAD_TYPE_STYLE
}

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState({
    openLeads: 0,
    wonLeads: 0,
    activeCustomers: 0,
    conversionRate: 0,
  })

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          console.error('Error getting session:', sessionError)
          setLoading(false)
          return
        }

        if (!session) {
          console.log('No session found in dashboard, redirecting to login')
          router.replace('/login')
          return
        }

        console.log('Session found in dashboard:', session.user.email)
        
        // Fetch initial data
        await Promise.all([
          fetchUsers(),
          fetchStats()
        ])

        // Set up real-time subscriptions
        const usersSubscription = supabase
          .channel('users-changes')
          .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'users' },
            () => {
              fetchUsers()
              fetchStats()
            }
          )
          .subscribe()

        setLoading(false)

        return () => {
          usersSubscription.unsubscribe()
        }
      } catch (error) {
        console.error('Error checking session:', error)
        setLoading(false)
        router.replace('/login')
      }
    }

    checkSession()
  }, [router])

  const fetchStats = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Get open leads count (using ACTIVE_STATUSES)
      const { count: openLeadsCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'lead')
        .eq('owner_id', session.user.id)
        .in('status', ACTIVE_STATUSES)
        .is('deleted_at', null)

      // Get won leads count
      const { count: wonLeadsCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'lead')
        .eq('owner_id', session.user.id)
        .eq('status', 'won')
        .is('deleted_at', null)

      // Get active customers count
      const { count: activeCustomersCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'customer')
        .eq('owner_id', session.user.id)
        .in('status', ACTIVE_STATUSES)
        .is('deleted_at', null)

      // Get total closed leads (won + lost) for conversion rate
      const { count: totalClosedLeads } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'lead')
        .eq('owner_id', session.user.id)
        .in('status', ['won', 'lost'])
        .is('deleted_at', null)

      const conversionRate = totalClosedLeads && wonLeadsCount ? (wonLeadsCount / totalClosedLeads) * 100 : 0

      setStats({
        openLeads: openLeadsCount || 0,
        wonLeads: wonLeadsCount || 0,
        activeCustomers: activeCustomersCount || 0,
        conversionRate,
      })
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const fetchUsers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      console.log('Fetching users for session:', session.user.id)

      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          companies!users_company_id_fkey (
            id,
            name
          )
        `)
        .in('role', ['lead', 'customer'])
        .eq('owner_id', session.user.id)
        .in('status', ACTIVE_STATUSES)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) {
        console.error('Error fetching users:', error)
        return
      }

      console.log('Raw user data:', data)

      // Sort users by lead type (B2C first), role (leads first), and status priority
      const sortedUsers = [...(data || [])].map(user => ({
        ...user,
        status: user.status as UserStatus,
        role: user.role as UserRole
      })).sort((a, b) => {
        // First sort by lead type (B2C first)
        if (a.role === 'lead' && b.role === 'lead') {
          if (a.lead_type !== b.lead_type) {
            return a.lead_type === 'B2C' ? -1 : 1
          }
        }
        // Then by role (leads first)
        if (a.role !== b.role) {
          return a.role === 'lead' ? -1 : 1
        }
        // Then by status priority
        const statusA = a.status as UserStatus
        const statusB = b.status as UserStatus
        return STATUS_PRIORITY[statusA] - STATUS_PRIORITY[statusB]
      })

      console.log('Sorted users:', sortedUsers)
      setUsers(sortedUsers)
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-16 mt-2" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-16 mt-2" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-16 mt-2" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-16 mt-2" />
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-8 w-32 mb-4" />
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-8 w-32 mb-4" />
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-4">
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
              <p className="text-sm font-medium text-muted-foreground">Active Customers</p>
              <p className="text-3xl font-bold">{stats.activeCustomers}</p>
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

      {/* Users Grid */}
      <div className="grid gap-4">
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4">Recent Leads</h2>
            <div className="space-y-4">
              {users
                .filter(user => user.role === 'lead')
                .map(user => (
                  <Link 
                    key={user.id} 
                    href={`/users/${user.id}`}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{user.first_name} {user.last_name}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={cn(
                        "px-2 py-1 text-xs rounded-full",
                        getStatusStyle(user.status).bg,
                        getStatusStyle(user.status).text
                      )}>
                        {user.status.replace('_', ' ')}
                      </span>
                      {user.lead_type && (
                        <span className={cn(
                          "px-2 py-1 text-xs rounded-full",
                          getLeadTypeStyle(user.lead_type).bg,
                          getLeadTypeStyle(user.lead_type).text
                        )}>
                          {user.lead_type}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

