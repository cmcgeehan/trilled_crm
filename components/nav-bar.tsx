"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { supabase } from "@/lib/supabase"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Users, LayoutDashboard, Building2, Building } from "lucide-react"
import { Database } from "@/types/supabase"

type Organization = Database['public']['Tables']['organizations']['Row']

export function NavBar() {
  const router = useRouter()
  const pathname = usePathname()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null)

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUserEmail(session?.user?.email ?? null)

      if (session?.user) {
        // Get user role and current organization
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('role, organization_id')
          .eq('id', session.user.id)
          .single()
        
        console.log('User data:', userData);
        if (userError) {
          console.error('Error fetching user:', userError);
          return;
        }
        
        if (userData) {
          const isAdmin = userData.role === 'super_admin';
          console.log('Is user super_admin?', isAdmin);
          setIsSuperAdmin(isAdmin)
          setCurrentOrgId(userData.organization_id)

          // If super admin, fetch all organizations
          if (isAdmin) {
            console.log('Fetching organizations as super_admin');
            const { data: orgs, error: orgsError } = await supabase
              .from('organizations')
              .select(`
                id,
                name,
                slug,
                plan,
                subscription_status,
                max_users,
                created_at,
                updated_at,
                deleted_at
              `)
              .is('deleted_at', null)
              .order('name')
            
            if (orgsError) {
              console.error('Error fetching organizations:', orgsError);
              return;
            }

            console.log('Found organizations:', orgs);
            setOrganizations(orgs || [])

            // If we have organizations but no current org ID, set the first one
            if (orgs && orgs.length > 0 && !userData.organization_id) {
              const { error: updateError } = await supabase
                .from('users')
                .update({ organization_id: orgs[0].id })
                .eq('id', session.user.id)

              if (updateError) {
                console.error('Error updating user organization:', updateError);
              } else {
                setCurrentOrgId(orgs[0].id)
              }
            }
          }
        }
      }
    }
    getUser()
  }, [])

  // Add debug renders
  console.log('Render state:', {
    isSuperAdmin,
    organizationsCount: organizations.length,
    currentOrgId,
    userEmail
  });

  const handleOrganizationChange = async (orgId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Update only the organization_id field
      const { error } = await supabase
        .from('users')
        .update({
          organization_id: orgId
        })
        .eq('id', user.id)

      if (error) {
        console.error('Error updating organization:', error)
        return
      }

      setCurrentOrgId(orgId)
      router.refresh()
    } catch (error) {
      console.error('Error switching organization:', error)
    }
  }

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
      setUserEmail(null)
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  if (!userEmail) return null

  return (
    <nav className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="text-2xl font-bold text-brand-lightBlue">
                Trilled
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              <Link
                href="/"
                className={cn(
                  "inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium",
                  pathname === "/"
                    ? "border-brand-lightBlue text-gray-900"
                    : "border-transparent text-gray-500 hover:border-brand-lightBlue hover:text-gray-700"
                )}
              >
                <LayoutDashboard className="h-4 w-4 mr-2" />
                Dashboard
              </Link>
              <Link
                href="/users"
                className={cn(
                  "inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium",
                  pathname.startsWith("/users")
                    ? "border-brand-lightBlue text-gray-900"
                    : "border-transparent text-gray-500 hover:border-brand-lightBlue hover:text-gray-700"
                )}
              >
                <Users className="h-4 w-4 mr-2" />
                Users
              </Link>
              <Link
                href="/companies"
                className={cn(
                  "inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium",
                  pathname.startsWith("/companies")
                    ? "border-brand-lightBlue text-gray-900"
                    : "border-transparent text-gray-500 hover:border-brand-lightBlue hover:text-gray-700"
                )}
              >
                <Building2 className="h-4 w-4 mr-2" />
                Companies
              </Link>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {isSuperAdmin && organizations.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md">
                    <Building className="h-4 w-4" />
                    <span>{organizations.find(org => org.id === currentOrgId)?.name || 'Select Organization'}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Switch Organization</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {organizations.map((org) => (
                    <DropdownMenuItem
                      key={org.id}
                      onClick={() => handleOrganizationChange(org.id)}
                      className={cn(
                        "cursor-pointer",
                        currentOrgId === org.id && "bg-gray-100"
                      )}
                    >
                      {org.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="outline-none">
                  <Avatar>
                    <AvatarFallback>
                      {userEmail.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{userEmail}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings/integrations">Integrations</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut}>
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  )
} 