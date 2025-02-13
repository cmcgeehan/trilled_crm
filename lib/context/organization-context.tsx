"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type OrganizationContextType = {
  currentUserRole: string | null
  currentOrganizationId: string | null
  userContextLoaded: boolean
  contextLoading: boolean
}

const OrganizationContext = createContext<OrganizationContextType>({
  currentUserRole: null,
  currentOrganizationId: null,
  userContextLoaded: false,
  contextLoading: true,
})

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null)
  const [userContextLoaded, setUserContextLoaded] = useState(false)
  const [contextLoading, setContextLoading] = useState(true)

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Get the current path
        const path = window.location.pathname

        // List of public routes that don't require a session
        const publicRoutes = ['/login', '/signup', '/auth/verify', '/auth/callback']
        if (publicRoutes.includes(path)) {
          setContextLoading(false)
          return
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          console.log('No session found, redirecting to login')
          router.replace('/login')
          return
        }

        console.log('Setting up real-time subscription for user:', session.user.id)

        // Get current user's role and organization
        const { data: userData } = await supabase
          .from('users')
          .select('role, organization_id')
          .eq('id', session.user.id)
          .single()
        
        if (userData) {
          console.log('Initial user data:', userData)
          setCurrentUserRole(userData.role)
          setCurrentOrganizationId(userData.organization_id)
        }

        setUserContextLoaded(true)
        setContextLoading(false)

        // Set up organization change listener
        const channel = supabase.channel('org_changes')
        
        // Listen for UPDATE changes to the users table for this user
        channel
          .on('postgres_changes', 
            { 
              event: 'UPDATE', 
              schema: 'public', 
              table: 'users',
              filter: `id=eq.${session.user.id}`
            },
            async (payload: RealtimePostgresChangesPayload<{
              id: string;
              organization_id: string | null;
              role: string | null;
            }>) => {
              console.log('User update detected:', payload)
              
              // Check if organization_id has changed
              const oldOrgId = (payload.old as { organization_id?: string | null })?.organization_id
              const newOrgId = (payload.new as { organization_id?: string | null })?.organization_id
              
              if (newOrgId && oldOrgId !== newOrgId) {
                console.log('Organization changed:', { oldOrgId, newOrgId })
                setCurrentOrganizationId(newOrgId)
              }
            }
          )
          .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
              console.log('Successfully subscribed to user changes')
            }
            if (status === 'CHANNEL_ERROR') {
              console.error('Channel error:', err)
            }
            if (status === 'TIMED_OUT') {
              console.error('Subscription timed out')
            }
            console.log('Subscription status:', status)
          })

        return () => {
          console.log('Cleaning up subscription')
          channel.unsubscribe()
        }
      } catch (error) {
        console.error('Error checking session:', error)
        router.replace('/login')
      }
    }

    checkSession()
  }, [router])

  return (
    <OrganizationContext.Provider value={{
      currentUserRole,
      currentOrganizationId,
      userContextLoaded,
      contextLoading,
    }}>
      {children}
    </OrganizationContext.Provider>
  )
}

export const useOrganization = () => useContext(OrganizationContext) 