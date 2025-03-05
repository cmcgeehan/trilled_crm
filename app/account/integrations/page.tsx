"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { Monitor, Mail, Phone, MessageCircle } from "lucide-react"

const Icons = {
  microsoft: Monitor,
  google: Mail,
  phone: Phone,
  message: MessageCircle
} as const

type IntegrationType = "email" | "phone" | "sms"
type IntegrationProvider = {
  name: string
  type: IntegrationType
  icon: keyof typeof Icons
  connected: boolean
}

const integrationProviders: IntegrationProvider[] = [
  { name: "Microsoft Teams", type: "phone", icon: "microsoft", connected: false },
  { name: "Dialpad", type: "phone", icon: "phone", connected: false },
  { name: "Twilio", type: "phone", icon: "phone", connected: false },
  { name: "Microsoft Teams", type: "sms", icon: "microsoft", connected: false },
  { name: "Twilio", type: "sms", icon: "message", connected: false },
  { name: "Vonage", type: "sms", icon: "message", connected: false },
]

export default function IntegrationsPage() {
  const router = useRouter()
  const [providers, setProviders] = useState(integrationProviders)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const loadIntegrations = useCallback(async (uid: string) => {
    try {
      const { data: integrations, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('user_id', uid)
        .eq('is_active', true)

      if (error) throw error

      setProviders(prevProviders => 
        prevProviders.map(provider => {
          const existingIntegration = integrations?.find(
            int => int.provider === provider.name && int.type === provider.type
          )
          return {
            ...provider,
            connected: !!existingIntegration
          }
        })
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations')
    } finally {
      setLoading(false)
    }
  }, [])

  const checkUser = useCallback(async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) throw sessionError
      
      if (!session) {
        router.push('/login')
        return
      }

      setUserId(session.user.id)
      loadIntegrations(session.user.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get user session')
      setLoading(false)
    }
  }, [router, loadIntegrations])

  useEffect(() => {
    checkUser()
  }, [checkUser])

  const handleConnect = async (index: number) => {
    if (!userId) {
      setError('No user session found')
      return
    }

    const provider = providers[index]
    setLoading(true)
    setError(null)

    try {
      if (provider.connected) {
        const { error } = await supabase
          .from('integrations')
          .update({ is_active: false })
          .eq('user_id', userId)
          .eq('provider', provider.name)
          .eq('type', provider.type)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('integrations')
          .insert({
            provider: provider.name,
            type: provider.type,
            user_id: userId,
            credentials: {},
            is_active: true
          })

        if (error) throw error
      }

      const newProviders = [...providers]
      newProviders[index].connected = !newProviders[index].connected
      setProviders(newProviders)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update integration')
    } finally {
      setLoading(false)
    }
  }

  const renderIntegrationSection = (type: IntegrationType) => {
    const typeProviders = providers.filter((provider) => provider.type === type)
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="capitalize">{type} Integrations</CardTitle>
          <CardDescription>Connect your {type} providers to Trilled CRM</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {typeProviders.map((provider, index) => {
            const Icon = Icons[provider.icon]
            return (
              <Card key={index}>
                <CardContent className="flex flex-col items-center justify-center p-6">
                  <Icon className="h-12 w-12 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">{provider.name}</h3>
                  <Button
                    variant={provider.connected ? "outline" : "default"}
                    onClick={() => handleConnect(providers.indexOf(provider))}
                    disabled={loading}
                  >
                    {provider.connected ? "Disconnect" : "Connect"}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-red-500">
        Error: {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Phone & SMS Integrations</h1>
      
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-blue-700">
          Looking for email integrations? Visit the{" "}
          <a href="/settings/integrations" className="font-medium underline">
            Email Integrations page
          </a>
          {" "}to connect your Gmail or Outlook account.
        </p>
      </div>

      {renderIntegrationSection("phone")}
      {renderIntegrationSection("sms")}
    </div>
  )
}

