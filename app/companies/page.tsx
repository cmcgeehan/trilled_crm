"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"
import { Plus, Search } from "lucide-react"
import { format } from "date-fns"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useRouter } from "next/navigation"
import { Database } from "@/types/supabase"
import { formatCompanyType } from "@/lib/utils"

type Company = Database['public']['Tables']['companies']['Row'] & {
  street_address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}
type CompanyType = 
  | 'aquatic_center'
  | 'big_brother_big_sister'
  | 'churches'
  | 'community_center'
  | 'detox'
  | 'doctors_office'
  | 'emergency_medical_services'
  | 'first_responders'
  | 'government_health_agencies'
  | 'health_foundations'
  | 'hospitals'
  | 'insurance'
  | 'lawyers_legal_services'
  | 'mental_health'
  | 'mental_health_inpatient'
  | 'occupational_health'
  | 'personal_life_coach'
  | 'recovery_services'
  | 'rehab_center'
  | 'resources'
  | 'rural_churches'
  | 'rural_community_centers'
  | 'rural_gp'
  | 'rural_ped_care'
  | 'schools'
  | 'sport_center'
  | 'therapists'
  | 'treatment_center'
  | 'veterans_services'
  | 'wellness_fitness'
  | 'ymca'
type SortField = 'created_at' | 'name' | 'type'
type SortOrder = 'asc' | 'desc'

export default function CompaniesPage() {
  const router = useRouter()
  const [searchInput, setSearchInput] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(true)
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [typeFilter, setTypeFilter] = useState<CompanyType | null>(null)
  const [neighborhoodFilter, setNeighborhoodFilter] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null)
  const [userContextLoaded, setUserContextLoaded] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const itemsPerPage = 20

  const loadCompanies = useCallback(async () => {
    try {
      setDataLoading(true)
      console.log('Loading companies with context:', {
        role: currentUserRole,
        organizationId: currentOrganizationId
      })

      const { data, error } = await supabase.rpc('get_companies_with_count', {
        p_organization_id: currentOrganizationId ?? undefined,
        p_type: typeFilter ?? undefined,
        p_neighborhood: neighborhoodFilter ?? undefined,
        p_search: searchTerm ?? undefined,
        p_limit: itemsPerPage,
        p_offset: (currentPage - 1) * itemsPerPage,
        p_sort_field: sortField,
        p_sort_order: sortOrder
      })

      if (error) {
        console.error('Error loading companies:', error)
        return
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        setTotalCount(0)
        setCompanies([])
        return
      }

      // Explicitly cast the expected structure from the RPC result
      const { companies, total_count } = data[0] as { companies: Company[], total_count: number }; 
      
      setTotalCount(total_count || 0)
      // Now TS should know 'companies' is Company[] or potentially null/undefined from the cast
      setCompanies(companies || []) // Keep the default empty array just in case
      
    } catch (err) {
      console.error('Error loading companies:', err)
    } finally {
      setDataLoading(false)
    }
  }, [currentUserRole, currentOrganizationId, typeFilter, sortField, sortOrder, currentPage, itemsPerPage, neighborhoodFilter, searchTerm])

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
        const { data: userData, error } = await supabase
          .from('users')
          .select('role, organization_id')
          .eq('id', session.user.id)
          .single()
        
        if (error) {
          console.error('Error fetching user data:', error)
          return
        }
        
        if (userData) {
          console.log('Setting user context:', userData)
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

  // Add effect to load companies when context is loaded
  useEffect(() => {
    if (userContextLoaded) {
      loadCompanies()
    }
  }, [userContextLoaded, loadCompanies])

  // Reset pagination when search term changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, typeFilter, neighborhoodFilter])

  // Remove client-side filtering since we're now doing it server-side
  const filteredCompanies = companies

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

  const handleSearch = () => {
    setSearchTerm(searchInput)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handleClearFilters = () => {
    setTypeFilter(null)
    setNeighborhoodFilter(null)
    setSearchInput("")
    setSearchTerm("")
  }

  const totalPages = Math.ceil(totalCount / itemsPerPage)

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
  }

  // Optimize neighborhood filter loading
  const uniqueNeighborhoods = useMemo(() => 
    Array.from(new Set(companies.map(c => c.neighborhood).filter(Boolean))).sort()
  , [companies])

  if (loading || dataLoading) {
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
          <h2 className="text-2xl font-semibold tracking-tight">Companies</h2>
          <p className="text-sm text-muted-foreground">
            Manage and view all companies in your CRM
          </p>
        </div>
        <div className="flex items-center gap-4">
          {currentUserRole && ['admin', 'super_admin'].includes(currentUserRole) && (
            <Button 
              asChild
              variant="outline"
              className="border-brand-darkBlue text-brand-darkBlue hover:bg-brand-darkBlue hover:text-brand-white"
            >
              <Link href="/companies/bulk-upsert">Bulk Upsert</Link>
            </Button>
          )}
          {currentUserRole && ['admin', 'super_admin', 'agent'].includes(currentUserRole) && (
            <Button asChild>
              <Link href="/companies/new">
                <Plus className="mr-2 h-4 w-4" /> Add Company
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <div className="flex gap-2">
            <Input
              placeholder="Search companies..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-8"
            />
            <Button 
              onClick={handleSearch}
              variant="secondary"
            >
              Search
            </Button>
          </div>
        </div>
        <Select
          value={typeFilter || "all"}
          onValueChange={(value) => setTypeFilter(value === "all" ? null : value as CompanyType)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="aquatic_center">Aquatic Center</SelectItem>
            <SelectItem value="big_brother_big_sister">Big Brother, Big Sister</SelectItem>
            <SelectItem value="churches">Churches</SelectItem>
            <SelectItem value="community_center">Community Center</SelectItem>
            <SelectItem value="detox">Detox</SelectItem>
            <SelectItem value="doctors_office">Doctor&apos;s Office</SelectItem>
            <SelectItem value="emergency_medical_services">Emergency Medical Services</SelectItem>
            <SelectItem value="first_responders">First Responders</SelectItem>
            <SelectItem value="government_health_agencies">Government Health Agencies</SelectItem>
            <SelectItem value="health_foundations">Health Foundations</SelectItem>
            <SelectItem value="hospitals">Hospitals</SelectItem>
            <SelectItem value="insurance">Insurance</SelectItem>
            <SelectItem value="lawyers_legal_services">Lawyers & Legal Services</SelectItem>
            <SelectItem value="mental_health">Mental Health</SelectItem>
            <SelectItem value="mental_health_inpatient">Mental Health Inpatient</SelectItem>
            <SelectItem value="occupational_health">Occupational Health Providers</SelectItem>
            <SelectItem value="personal_life_coach">Personal Life Coach</SelectItem>
            <SelectItem value="recovery_services">Recovery Services</SelectItem>
            <SelectItem value="rehab_center">Rehab Center</SelectItem>
            <SelectItem value="resources">Resources</SelectItem>
            <SelectItem value="rural_churches">Rural Areas Churches</SelectItem>
            <SelectItem value="rural_community_centers">Rural Areas Community Centers</SelectItem>
            <SelectItem value="rural_gp">Rural Areas GP</SelectItem>
            <SelectItem value="rural_ped_care">Rural Areas Ped Care</SelectItem>
            <SelectItem value="schools">Schools</SelectItem>
            <SelectItem value="sport_center">Sport Center</SelectItem>
            <SelectItem value="therapists">Therapists</SelectItem>
            <SelectItem value="treatment_center">Treatment Center</SelectItem>
            <SelectItem value="veterans_services">Veterans Services</SelectItem>
            <SelectItem value="wellness_fitness">Wellness & Fitness Companies</SelectItem>
            <SelectItem value="ymca">YMCA</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={neighborhoodFilter || "all"}
          onValueChange={(value) => setNeighborhoodFilter(value === "all" ? null : value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by neighborhood" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Neighborhoods</SelectItem>
            {uniqueNeighborhoods.map(neighborhood => (
              <SelectItem key={neighborhood!} value={neighborhood!}>{neighborhood}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={handleClearFilters}>
          Clear Filters
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead 
                className="text-sm font-medium cursor-pointer"
                onClick={() => handleSort('name')}
              >
                Name {getSortIcon('name')}
              </TableHead>
              <TableHead 
                className="text-sm font-medium cursor-pointer"
                onClick={() => handleSort('type')}
              >
                Type {getSortIcon('type')}
              </TableHead>
              <TableHead className="text-sm font-medium">Neighborhood</TableHead>
              <TableHead className="text-sm font-medium">Address</TableHead>
              <TableHead 
                className="text-sm font-medium cursor-pointer whitespace-nowrap"
                onClick={() => handleSort('created_at')}
              >
                Created {getSortIcon('created_at')}
              </TableHead>
              <TableHead className="text-sm font-medium text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-3 text-sm">
                  Loading companies...
                </TableCell>
              </TableRow>
            ) : filteredCompanies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-3 text-sm">
                  {searchTerm ? 'No companies found matching your search' : 'No companies found'}
                </TableCell>
              </TableRow>
            ) : (
              filteredCompanies.map((company) => (
                <TableRow 
                  key={company.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => router.push(`/companies/${company.id}`)}
                >
                  <TableCell className="py-2 text-sm font-medium">{company.name}</TableCell>
                  <TableCell className="py-2">
                    <Badge variant="secondary" className="text-xs px-2 py-0.5">
                      {company.type ? formatCompanyType(company.type) : 'N/A'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 text-sm">
                    {company.neighborhood || <span className="text-gray-400">No neighborhood</span>}
                  </TableCell>
                  <TableCell className="py-2 text-sm">
                    {[
                      company.street_address,
                      company.city,
                      company.state,
                      company.country,
                    ].filter(Boolean).join(', ') || <span className="text-gray-400">No address</span>}
                  </TableCell>
                  <TableCell className="py-2 text-sm whitespace-nowrap">
                    {company.created_at ? format(new Date(company.created_at), 'MMM d, yyyy') : '-'}
                  </TableCell>
                  <TableCell className="py-2 text-sm text-right">
                    <Button
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/companies/${company.id}`)
                      }}
                      className="text-sm"
                    >
                      View
                    </Button>
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