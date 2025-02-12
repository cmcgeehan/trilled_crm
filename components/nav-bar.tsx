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
import { Users, LayoutDashboard, Building2 } from "lucide-react"

export function NavBar() {
  const router = useRouter()
  const pathname = usePathname()
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUserEmail(session?.user?.email ?? null)
    }
    getUser()
  }, [])

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
          <div className="flex items-center">
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
                  <Link href="/account">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/account/integrations">Integrations</Link>
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