"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useCallback, useEffect, useState, Suspense } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { useRouter, useSearchParams } from "next/navigation"
import { Mail } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Database } from "@/types/supabase"

type EmailIntegration = Database['public']['Tables']['email_integrations']['Row']

function EmailIntegrationsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient<Database>()
  const [integrations, setIntegrations] = useState<EmailIntegration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Check for success or error messages in URL
  useEffect(() => {
    const success = searchParams?.get('success') || ''
    const error = searchParams?.get('error') || ''
    
    if (success === 'connected') {
      setSuccess('Email integration connected successfully!')
    } else if (error) {
      setError(decodeURIComponent(error))
    }
  }, [searchParams])

  const loadIntegrations = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session.session) {
        router.push('/login')
        return
      }

      const { data: integrations, error } = await supabase
        .from('email_integrations')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error

      setIntegrations(integrations || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations')
    } finally {
      setLoading(false)
    }
  }, [router, supabase])

  useEffect(() => {
    loadIntegrations()
  }, [loadIntegrations])

  const handleConnect = async (provider: 'gmail' | 'outlook') => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch(`/api/auth/${provider}/authorize`)
      const data = await response.json()
      
      if (!response.ok) throw new Error(data.error)
      
      // Redirect to OAuth provider
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start OAuth flow')
      setLoading(false)
    }
  }

  const handleDisconnect = async (integration: EmailIntegration) => {
    try {
      setLoading(true)
      setError(null)

      const { error } = await supabase
        .from('email_integrations')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', integration.id)

      if (error) throw error

      // Refresh the list
      await loadIntegrations()
      setSuccess('Email integration disconnected successfully!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect integration')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Email Integrations</h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Gmail Integration Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Gmail
            </CardTitle>
            <CardDescription>
              Connect your Gmail account to send emails
            </CardDescription>
          </CardHeader>
          <CardContent>
            {integrations.find(i => i.provider === 'gmail') ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Connected as: {integrations.find(i => i.provider === 'gmail')?.email}
                </p>
                <Button
                  variant="outline"
                  onClick={() => handleDisconnect(integrations.find(i => i.provider === 'gmail')!)}
                  disabled={loading}
                >
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => handleConnect('gmail')}
                disabled={loading}
              >
                Connect Gmail
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Outlook Integration Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Outlook
            </CardTitle>
            <CardDescription>
              Connect your Outlook account to send emails
            </CardDescription>
          </CardHeader>
          <CardContent>
            {integrations.find(i => i.provider === 'outlook') ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Connected as: {integrations.find(i => i.provider === 'outlook')?.email}
                </p>
                <Button
                  variant="outline"
                  onClick={() => handleDisconnect(integrations.find(i => i.provider === 'outlook')!)}
                  disabled={loading}
                >
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => handleConnect('outlook')}
                disabled={loading}
              >
                Connect Outlook
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function EmailIntegrationsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <EmailIntegrationsContent />
    </Suspense>
  )
} 