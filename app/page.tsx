"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Database } from "@/types/supabase"
import { cn } from "@/lib/utils"

type UserStatus = 'needs_response' | 'new' | 'follow_up' | 'won' | 'lost'
type UserRole = 'lead' | 'customer' | 'agent' | 'admin' | 'super_admin'

type User = Omit<Database['public']['Tables']['users']['Row'], 'status' | 'role'> & {
  status: UserStatus
  role: UserRole
  position?: string | null
  companies?: {
    id: string
    name: string
  } | null
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

const ROLE_BADGE_STYLES: Record<'lead' | 'customer', { bg: string, text: string }> = {
  'lead': { bg: 'bg-purple-100', text: 'text-purple-800' },
  'customer': { bg: 'bg-green-100', text: 'text-green-800' },
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
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          console.log('No session found in dashboard, redirecting to login')
          router.replace('/login')
          return
        }
        console.log('Session found in dashboard:', session.user.email)
        setLoading(false)
        
        // Fetch initial data
        fetchUsers()
        fetchStats()

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

        return () => {
          usersSubscription.unsubscribe()
        }
      } catch (error) {
        console.error('Error checking session:', error)
        router.replace('/login')
      }
    }

    checkSession()
  }, [router])

  const fetchStats = async () => {
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
  }

  const fetchUsers = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        companies (
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

    // Sort users by status priority and ensure correct typing
    const sortedUsers = [...(data || [])].map(user => ({
      ...user,
      status: user.status as UserStatus,
      role: user.role as UserRole
    })).sort((a, b) => {
      // First sort by role (leads first)
      if (a.role !== b.role) {
        return a.role === 'lead' ? -1 : 1
      }
      // Then by status priority
      const statusA = a.status as UserStatus
      const statusB = b.status as UserStatus
      return STATUS_PRIORITY[statusA] - STATUS_PRIORITY[statusB]
    })

    setUsers(sortedUsers)
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
        {users.length === 0 ? (
          <Card>
            <CardContent className="p-4">
              <p className="text-gray-500 text-center">No users in your queue</p>
            </CardContent>
          </Card>
        ) : (
          users.map((user) => (
            <Card key={user.id}>
              <CardContent className="flex justify-between items-center p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-brand-darkBlue">
                      {user.first_name} {user.last_name}
                    </p>
                    <div 
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        ROLE_BADGE_STYLES[user.role as 'lead' | 'customer'].bg,
                        ROLE_BADGE_STYLES[user.role as 'lead' | 'customer'].text
                      )}
                    >
                      {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                    </div>
                  </div>
                  <p className="text-sm text-brand-darkBlue/70">
                    {user.companies?.name ? (
                      <>
                        {user.companies.name}
                        {user.position && (
                          <>
                            <span className="mx-1">·</span>
                            <span>{user.position}</span>
                          </>
                        )}
                      </>
                    ) : user.position ? (
                      <span>{user.position}</span>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <div 
                    className={cn(
                      "rounded-full px-3 py-1 text-sm font-medium",
                      STATUS_STYLES[user.status].bg,
                      STATUS_STYLES[user.status].text
                    )}
                  >
                    {user.status.split('_').map(word => 
                      word.charAt(0).toUpperCase() + word.slice(1)
                    ).join(' ')}
                  </div>
                  <Button 
                    asChild 
                    variant="outline" 
                    size="sm"
                    className="border-brand-darkBlue text-brand-darkBlue hover:bg-brand-darkBlue hover:text-brand-white"
                  >
                    <Link href={`/users/${user.id}`}>View Details</Link>
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

