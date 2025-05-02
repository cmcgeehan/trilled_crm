"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"
import { Plus, Search, Phone } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { Database } from "@/types/supabase"
import { toast } from "react-hot-toast"
import emitter from "@/lib/event-emitter"

type User = Omit<Database['public']['Tables']['users']['Row'], 'status'> & {
  status: UserStatus,
  companies?: {
    id: string;
    name: string;
  } | null
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
  const [searchInput, setSearchInput] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(true)
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [roleFilter, setRoleFilter] = useState<UserRole | null>(null)
  const [statusFilter, setStatusFilter] = useState<UserStatus | null>(null)
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [agents, setAgents] = useState<User[]>([])
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null)
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null)
  const [userContextLoaded, setUserContextLoaded] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const itemsPerPage = 20

  const loadUsers = useCallback(async () => {
    try {
      setDataLoading(true)
      let query = supabase
        .from('users')
        .select(`
          *,
          companies!company_id (
            id,
            name
          )
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage - 1)

      // Apply filters
      if (roleFilter) {
        query = query.eq('role', roleFilter)
      }
      if (statusFilter) {
        query = query.eq('status', statusFilter)
      }
      if (ownerFilter && ownerFilter !== 'all') {
        query = query.eq('owner_id', ownerFilter)
      }
      if (searchTerm) {
        query = query.or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
      }

      // Apply organization filter for non-super admins
      if (currentUserRole !== 'super_admin') {
        if (currentOrganizationId) {
          query = query.eq('organization_id', currentOrganizationId)
        } else {
          console.warn('Non-super_admin has no organization ID. Filtering out all users.')
          query = query.eq('id', 'invalid-uuid')
        }
      }

      const { data, error, count } = await query

      if (error) {
        console.error('Error loading users:', error)
        toast.error('Error loading users')
        return
      }

      // Map fetched data to match local User type before setting state
      const mappedUsers = (data || []).map(user => {
        const status = (user.status ?? 'new') as UserStatus;
        const lead_type = user.lead_type ?? null;

        const mappedUser: User = {
          // Spread the original user object first
          ...user, 
          // Then overwrite/add fields to match the User type
          id: user.id!, 
          email: user.email || '', 
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          role: user.role as UserRole, 
          status: status, // Overwrite with the validated status
          lead_type: lead_type, 
          company_id: user.company_id ?? null, 
          owner_id: user.owner_id ?? null, 
          created_at: user.created_at!, 
          updated_at: user.updated_at!, 
          companies: user.companies ? {
            id: user.companies.id!, 
            name: user.companies.name || '' 
          } : null,
        };
        // Remove fields not present in User type if necessary (e.g., if base Row has extra fields)
        // delete (mappedUser as any).original_status_field_if_different_name;
        return mappedUser;
      });

      setUsers(mappedUsers)
      setTotalCount(count || 0)
    } catch (err) {
      console.error('Error loading users:', err)
      toast.error('Error loading users')
    } finally {
      setDataLoading(false)
    }
  }, [currentPage, roleFilter, statusFilter, ownerFilter, searchTerm, currentUserRole, currentOrganizationId])

  const loadAgents = useCallback(async () => {
    try {
      let query = supabase
        .from('users')
        // Select all fields needed for the User type + companies for consistency
        .select(`
          *,
          companies!company_id (
            id,
            name
          )
        `)
        .in('role', ['agent', 'admin', 'super_admin'])
        .is('deleted_at', null)

      // Only filter by organization for non-super admins
      if (currentUserRole !== 'super_admin') {
        // Add null check for organization ID
        if (currentOrganizationId) {
          query = query.eq('organization_id', currentOrganizationId)
        } else {
          // Non-super_admin without org ID shouldn't see any agents
          setAgents([]); // Set empty array and return
          return; 
        }
      }

      const { data: agentUsers, error } = await query

      if (error) throw error
      
      // Map fetched agent data to match local User type
      const mappedAgents = (agentUsers || []).map(agent => {
        const status = (agent.status ?? 'new') as UserStatus; 
        const lead_type = agent.lead_type ?? null;
        
        const mappedAgent: User = {
          // Spread the original agent object first
          ...agent,
          // Then overwrite/add fields to match the User type
          id: agent.id!, 
          email: agent.email || '', 
          first_name: agent.first_name || '',
          last_name: agent.last_name || '',
          role: agent.role as UserRole, 
          status: status, // Overwrite with the validated status
          lead_type: lead_type, 
          company_id: agent.company_id ?? null, 
          owner_id: agent.owner_id ?? null, 
          created_at: agent.created_at!, 
          updated_at: agent.updated_at!, 
          companies: agent.companies ? {
            id: agent.companies.id!, 
            name: agent.companies.name || '' 
          } : null,
        };
        // Remove fields not present in User type if necessary
        // delete (mappedAgent as any).original_status_field_if_different_name;
        return mappedAgent;
      });

      setAgents(mappedAgents) // Set the correctly typed agents
    } catch (error) {
      console.error('Error loading agents:', error)
      toast.error('Failed to load agents')
    }
  }, [currentOrganizationId, currentUserRole])

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          console.log('No session found in dashboard, redirecting to login')
          router.replace('/login')
          return
        }

        // Get current user's role and organization
        const { data: userData } = await supabase
          .from('users')
          .select('role, organization_id')
          .eq('id', session.user.id)
          .single()
        
        if (userData) {
          setCurrentUserRole(userData.role)
          setCurrentOrganizationId(userData.organization_id)
          // Set the current user ID and default owner filter
          setCurrentUserId(session.user.id)
          setOwnerFilter(session.user.id)
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

  useEffect(() => {
    if (userContextLoaded) {
      loadAgents()
      loadUsers()
    }
  }, [userContextLoaded, loadAgents, loadUsers])

  // Reset pagination when search term changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, roleFilter, statusFilter, ownerFilter])

  // Remove client-side filtering since we're now doing it server-side
  const filteredUsers = users

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
    setOwnerFilter(currentUserId || 'all')
    setSearchInput("")
    setSearchTerm("")
  }

  const totalPages = Math.ceil(totalCount / itemsPerPage)

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
  }

  const handleSearch = () => {
    setSearchTerm(searchInput)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handleInitiateCall = (user: User) => {
    if (!user.phone) {
      toast.error("User does not have a phone number.");
      return;
    }
    console.log(`[UsersPage] Emitting initiate-call for ${user.phone}`);
    
    // Construct name, providing fallback if email is also null
    const contactName = (`${user.first_name || ''} ${user.last_name || ''}`.trim()) || user.email || 'Unknown Contact';

    emitter.emit('initiate-call', { 
      phoneNumber: user.phone, 
      contactInfo: { 
        id: user.id, 
        name: contactName
      }
    });
    toast.success(`Initiating call to ${user.first_name || user.phone}...`);
  };

  if (loading || dataLoading || !userContextLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading...</p>
      </div>
    )
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
            <div className="flex gap-2">
              <Input
                placeholder="Search users..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-10 text-base"
              />
              <Button 
                onClick={handleSearch}
                variant="secondary"
              >
                Search
              </Button>
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Owner</p>
          <Select 
            value={ownerFilter === null ? undefined : ownerFilter}
            onValueChange={(value) => handleOwnerFilterChange(value === "all" ? null : value)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Owners</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
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
          <Select value={roleFilter === null ? undefined : roleFilter} onValueChange={(value: UserRole | "all") => setRoleFilter(value === "all" ? null : value)}>
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
            value={statusFilter === null ? undefined : statusFilter} 
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
                className="text-sm font-medium cursor-pointer w-[15%] min-w-[150px]"
                onClick={() => handleSort('first_name')}
              >
                Name {getSortIcon('first_name')}
              </TableHead>
              <TableHead className="text-sm font-medium min-w-[150px] max-w-[250px]">Company</TableHead>
              <TableHead className="text-sm font-medium min-w-[150px] max-w-[150px]">Position</TableHead>
              <TableHead 
                className="text-sm font-medium cursor-pointer min-w-[200px] max-w-[250px]"
                onClick={() => handleSort('email')}
              >
                Email {getSortIcon('email')}
              </TableHead>
              <TableHead className="text-sm font-medium min-w-[120px]">Phone</TableHead> 
              <TableHead 
                className="text-sm font-medium cursor-pointer min-w-[100px]"
                onClick={() => handleSort('status')}
              >
                Status {getSortIcon('status')}
              </TableHead>
              <TableHead 
                className="text-sm font-medium cursor-pointer min-w-[60px]" 
                onClick={() => handleSort('role')}
              >
                Role {getSortIcon('role')}
              </TableHead>
              <TableHead className="text-sm font-medium text-right min-w-[50px] px-2">Call</TableHead> 
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
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/users/${user.id}`)}
                >
                  <TableCell className="py-2 text-sm font-medium">
                    <Link href={`/users/${user.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                      {user.first_name || user.last_name ? (
                        `${user.first_name || ''} ${user.last_name || ''}`.trim()
                      ) : (
                        <span className="text-gray-400">No name</span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="py-2 text-sm truncate max-w-[250px]">{user.companies?.name || <span className="text-gray-400">-</span>}</TableCell>
                  <TableCell className="py-2 text-sm truncate max-w-[150px]">{user.position || <span className="text-gray-400">-</span>}</TableCell>
                  <TableCell className="py-2 text-sm truncate max-w-[250px]">{user.email || <span className="text-gray-400">-</span>}</TableCell>
                  <TableCell className="py-2 text-sm truncate">{user.phone || <span className="text-gray-400">-</span>}</TableCell>
                  <TableCell className="py-2 px-2">
                    <div 
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap",
                        user.status && STATUS_STYLES[user.status]?.bg || 'bg-gray-200',
                        user.status && STATUS_STYLES[user.status]?.text || 'text-gray-700'
                      )}
                    >
                      {user.status?.split('_').map(word => 
                        word.charAt(0).toUpperCase() + word.slice(1)
                      ).join(' ') || 'Unknown'}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 px-2">
                    <Badge variant="secondary" className="text-xs px-2 py-0.5">
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 px-2 text-right">
                     {user.phone && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Call User"
                          onClick={(e) => {
                              e.stopPropagation();
                              handleInitiateCall(user);
                          }}
                          className="h-7 w-7"
                        >
                          <Phone className="h-4 w-4" />
                          <span className="sr-only">Call User</span>
                        </Button>
                     )}
                     {!user.phone && (
                       <div className="h-7 w-7 inline-block"></div>
                     )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between px-2 py-4">
        <div className="text-sm text-muted-foreground">
          Showing {Math.min((currentPage - 1) * itemsPerPage + 1, totalCount)} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} entries
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <Button
              key={page}
              variant={currentPage === page ? "default" : "outline"}
              size="sm"
              onClick={() => handlePageChange(page)}
            >
              {page}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}

