"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"
import { Plus, Search } from "lucide-react"
import { format } from "date-fns"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { Database } from "@/types/supabase"

type User = Omit<Database['public']['Tables']['users']['Row'], 'status'> & {
  status: UserStatus,
  company_name?: string | null
}

type UserRole = 'lead' | 'customer' | 'agent' | 'admin' | 'super_admin'
type UserStatus = 'needs_response' | 'new' | 'follow_up' | 'won' | 'lost'
type SortField = 'created_at' | 'first_name' | 'email' | 'status' | 'role'
type SortOrder = 'asc' | 'desc'

const STATUS_STYLES: Record<UserStatus, { bg: string, text: string }> = {
  'needs_response': { bg: 'bg-brand-orange', text: 'text-white' },
  'new': { bg: 'bg-brand-lightBlue', text: 'text-white' },
  'follow_up': { bg: 'bg-brand-darkBlue', text: 'text-brand-white' },
  'won': { bg: 'bg-brand-lightBlue', text: 'text-brand-darkBlue' },
  'lost': { bg: 'bg-brand-darkRed', text: 'text-brand-white' },
}

export default function UsersPage() {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState("")
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [roleFilter, setRoleFilter] = useState<UserRole | null>('lead')
  const [statusFilter, setStatusFilter] = useState<UserStatus | null>(null)
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [agents, setAgents] = useState<User[]>([])
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null)

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
        console.log('Session Data:', { authUser })
        
        if (authError || !authUser?.id) {
          console.error('Error getting auth user:', authError)
          return
        }

        const { data: userData, error: userError } = await supabase
          .from('users')
          .select()
          .eq('id', authUser.id)
          .is('deleted_at', null)
          .maybeSingle()
          
        if (userError) {
          console.error('Error loading current user:', userError)
          return
        }
          
        if (!userData) {
          const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert({
              id: authUser.id,
              email: authUser.email,
              role: 'lead',
              status: 'new' as UserStatus
            })
            .select()
            .single()
            
          if (createError) {
            console.error('Error creating user:', createError)
            return
          }
            
          setCurrentUser(newUser as User)
          if (['agent', 'admin', 'super_admin'].includes(newUser.role) && newUser.id) {
            handleOwnerFilterChange(newUser.id)
          }
        } else {
          setCurrentUser(userData as User)
          if (['agent', 'admin', 'super_admin'].includes(userData.role) && userData.id) {
            handleOwnerFilterChange(userData.id)
          }
        }
      } catch (err) {
        console.error('Error loading current user:', err)
      }
    }
    loadCurrentUser()
  }, [])

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .not('role', 'in', '("lead","customer")')
          .is('deleted_at', null)
          .order('role')
        
        if (error) {
          console.error('Error loading agents:', error)
          return
        }
        
        setAgents((data || []) as User[])
      } catch (err) {
        console.error('Error loading agents:', err)
      }
    }

    loadAgents()
  }, [])

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setLoading(true)
        let query = supabase
          .from('users')
          .select(`
            *,
            companies (
              name
            ),
            position
          `)
          .is('deleted_at', null)

        if (roleFilter) {
          query = query.eq('role', roleFilter)
        }
        if (statusFilter) {
          query = query.eq('status', statusFilter)
        }
        if (ownerFilter !== 'all') {
          query = query.eq('owner_id', ownerFilter)
        } else if (currentUser?.role !== 'admin' && currentUser?.role !== 'super_admin' && currentUser?.id) {
          query = query.eq('owner_id', currentUser.id)
        }

        query = query.order(sortField, { ascending: sortOrder === 'asc' })
        
        const { data, error } = await query
        
        if (error) {
          console.error('Error loading users:', error)
          return
        }
        
        const usersWithCompanyNames = (data || []).map(user => ({
          ...user,
          company_name: user.companies?.name
        }))
        
        setUsers(usersWithCompanyNames as User[])
      } catch (err) {
        console.error('Error loading users:', err)
      } finally {
        setLoading(false)
      }
    }
    loadUsers()
  }, [sortField, sortOrder, roleFilter, statusFilter, ownerFilter, currentUser])

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
        
        // Get current user's role
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', session.user.id)
          .single()
        
        if (userData) {
          setCurrentUserRole(userData.role as UserRole)
        }
      } catch (error) {
        console.error('Error checking session:', error)
        router.replace('/login')
      }
    }

    checkSession()
  }, [router])

  const filteredUsers = users.filter(user => {
    const searchLower = searchTerm.toLowerCase()
    return (
      (user.email?.toLowerCase().includes(searchLower) ?? false) ||
      (user.phone?.toLowerCase().includes(searchLower) ?? false) ||
      (user.first_name?.toLowerCase().includes(searchLower) ?? false) ||
      (user.last_name?.toLowerCase().includes(searchLower) ?? false) ||
      (user.company_name?.toLowerCase().includes(searchLower) ?? false)
    )
  })

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const getSortIcon = (field: SortField) => {
    if (field !== sortField) return null
    return sortOrder === 'asc' ? '↑' : '↓'
  }

  const handleOwnerFilterChange = (ownerId: string | null) => {
    setOwnerFilter(ownerId || 'all')
  }

  const handleClearFilters = () => {
    setRoleFilter(null)
    setStatusFilter(null)
    setOwnerFilter('all')
    setSearchTerm("")
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-8">
        <div className="space-y-1">
          <h2 className="text-3xl font-semibold tracking-tight">Users</h2>
          <p className="text-base text-muted-foreground">
            Manage your users, customers, and leads
          </p>
        </div>
        <div className="space-x-4">
          {currentUserRole && ['admin', 'super_admin'].includes(currentUserRole) && (
            <Button 
              asChild
              variant="outline"
              className="border-brand-darkBlue text-brand-darkBlue hover:bg-brand-darkBlue hover:text-brand-white"
            >
              <Link href="/users/bulk-upsert">Bulk Upsert</Link>
            </Button>
          )}
          <Button 
            asChild
            className="bg-brand-darkBlue hover:bg-brand-darkBlue/90 text-white"
          >
            <Link href="/users/new">
              <Plus className="mr-2 h-4 w-4" />
              Add User
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 py-4 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Search</p>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 text-base"
            />
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Owner</p>
          <Select value={ownerFilter || "all"} onValueChange={(value) => handleOwnerFilterChange(value === "all" ? null : value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owners</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.first_name || agent.email || `Agent ${agent.id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Type</p>
          <Select value={roleFilter || "all"} onValueChange={(value: UserRole | "all") => setRoleFilter(value === "all" ? null : value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="lead">Leads</SelectItem>
              <SelectItem value="customer">Customers</SelectItem>
              <SelectItem value="agent">Agents</SelectItem>
              <SelectItem value="admin">Admins</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Status</p>
          <Select 
            value={statusFilter || "all"} 
            onValueChange={(value) => setStatusFilter(value === "all" ? null : value as UserStatus)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="needs_response">Needs Response</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="follow_up">Follow Up</SelectItem>
              <SelectItem value="won">Won</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="self-end">
          <Button 
            variant="outline" 
            onClick={handleClearFilters}
          >
            Clear Filters
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead 
                className="text-sm font-medium cursor-pointer"
                onClick={() => handleSort('first_name')}
              >
                Name {getSortIcon('first_name')}
              </TableHead>
              <TableHead 
                className="text-sm font-medium cursor-pointer"
                onClick={() => handleSort('email')}
              >
                Email {getSortIcon('email')}
              </TableHead>
              <TableHead className="text-sm font-medium">Phone</TableHead>
              <TableHead className="text-sm font-medium">Position</TableHead>
              <TableHead className="text-sm font-medium">Company</TableHead>
              <TableHead 
                className="text-sm font-medium cursor-pointer"
                onClick={() => handleSort('status')}
              >
                Status {getSortIcon('status')}
              </TableHead>
              <TableHead 
                className="text-sm font-medium cursor-pointer"
                onClick={() => handleSort('role')}
              >
                Role {getSortIcon('role')}
              </TableHead>
              <TableHead 
                className="text-sm font-medium cursor-pointer whitespace-nowrap"
                onClick={() => handleSort('created_at')}
              >
                Created {getSortIcon('created_at')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-3 text-sm">
                  Loading users...
                </TableCell>
              </TableRow>
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-3 text-sm">
                  {searchTerm ? 'No users found matching your search' : 'No users found'}
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow 
                  key={user.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => window.location.href = `/users/${user.id}`}
                >
                  <TableCell className="py-2 text-sm font-medium">
                    {user.first_name || user.last_name ? (
                      `${user.first_name || ''} ${user.last_name || ''}`.trim()
                    ) : (
                      <span className="text-gray-400">No name</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-sm">{user.email || <span className="text-gray-400">No email</span>}</TableCell>
                  <TableCell className="py-2 text-sm">{user.phone || <span className="text-gray-400">No phone</span>}</TableCell>
                  <TableCell className="py-2 text-sm">{user.position || <span className="text-gray-400">No position</span>}</TableCell>
                  <TableCell className="py-2 text-sm">{user.company_name || <span className="text-gray-400">No company</span>}</TableCell>
                  <TableCell className="py-2">
                    <div 
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium w-fit",
                        user.status && STATUS_STYLES[user.status]?.bg || 'bg-gray-200',
                        user.status && STATUS_STYLES[user.status]?.text || 'text-gray-700'
                      )}
                    >
                      {user.status?.split('_').map(word => 
                        word.charAt(0).toUpperCase() + word.slice(1)
                      ).join(' ') || 'Unknown'}
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge variant="secondary" className="text-xs px-2 py-0.5">
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 text-sm whitespace-nowrap">
                    {user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

