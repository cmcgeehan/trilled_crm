import { NextResponse } from 'next/server'
import { Database } from '@/types/supabase'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createCookieHandlers(request: Request, response: Response) {
  return {
    get: (name: string) => {
      const cookie = request.headers.get('cookie')
      if (!cookie) return undefined
      const match = cookie.match(new RegExp(`(^| )${name}=([^;]+)`))
      return match ? match[2] : undefined
    },
    set: (name: string, value: string, options: any) => {
      const { expires, path = '/' } = options
      response.headers.set(
        'Set-Cookie',
        `${name}=${value}; Path=${path}; HttpOnly; Secure; SameSite=Lax${expires ? `; Expires=${expires.toUTCString()}` : ''}`
      )
    },
    remove: (name: string, options: any) => {
      const { path = '/' } = options
      response.headers.set(
        'Set-Cookie',
        `${name}=; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
      )
    }
  }
}

export function copyResponseHeaders(from: Response, to: Response) {
  from.headers.forEach((value, key) => {
    to.headers.set(key, value)
  })
}

export function getServerSupabase() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: () => undefined,
        set: () => {},
        remove: () => {}
      }
    }
  )
}

export const getServerOrganization = async () => {
  const supabase = await getServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data: user } = await supabase
    .from('users')
    .select('organization_id')
    .eq('id', session.user.id)
    .single()

  if (!user) return null

  const { data: organization } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', user.organization_id)
    .single()

  return organization
}

export type CookieOptions = {
  expires?: Date
  path?: string
} 