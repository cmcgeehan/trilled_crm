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
import { useRouter } from "next/navigation"
import { Database } from "@/types/supabase"

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
  const [searchTerm, setSearchTerm] = useState("")
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [typeFilter, setTypeFilter] = useState<CompanyType | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)

  useEffect(() => {
    const loadCompanies = async () => {
      try {
        setLoading(true)
        let query = supabase
          .from('companies')
          .select('*')
          .is('deleted_at', null)

        if (typeFilter) {
          query = query.eq('type', typeFilter)
        }

        query = query.order(sortField, { ascending: sortOrder === 'asc' })
        
        const { data, error } = await query
        
        if (error) {
          console.error('Error loading companies:', error)
          return
        }
        
        setCompanies(data || [])
      } catch (err) {
        console.error('Error loading companies:', err)
      } finally {
        setLoading(false)
      }
    }
    loadCompanies()
  }, [sortField, sortOrder, typeFilter])

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
          setCurrentUserRole(userData.role)
        }
      } catch (error) {
        console.error('Error checking session:', error)
        router.replace('/login')
      }
    }

    checkSession()
  }, [router])

  const filteredCompanies = companies.filter(company => {
    const searchLower = searchTerm.toLowerCase()
    return (
      (company.name?.toLowerCase().includes(searchLower) ?? false) ||
      (company.type?.toLowerCase().includes(searchLower) ?? false) ||
      (company.street_address?.toLowerCase().includes(searchLower) ?? false) ||
      (company.city?.toLowerCase().includes(searchLower) ?? false)
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

  const handleClearFilters = () => {
    setTypeFilter(null)
    setSearchTerm("")
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
          <Button asChild>
            <Link href="/companies/new">
              <Plus className="mr-2 h-4 w-4" /> Add Company
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
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
                      {company.type || 'N/A'}
                    </Badge>
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
    </div>
  )
} 