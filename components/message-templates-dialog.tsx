"use client"

import * as React from "react"
import { Plus, Trash2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { toast } from "sonner"

interface MessageTemplatesDialogProps {
  trigger?: React.ReactNode
  onInsert?: (template: { content: string }) => void
}

export function MessageTemplatesDialog({ trigger, onInsert }: MessageTemplatesDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [templates, setTemplates] = React.useState<Array<{
    id: string
    name: string
    content: string
  }>>([])
  const [newTemplate, setNewTemplate] = React.useState({
    name: "",
    content: "",
  })
  const supabase = createClientComponentClient()

  const loadTemplates = React.useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data: templates, error } = await supabase
      .from('message_templates')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading templates:', error)
      return
    }

    setTemplates(templates || [])
  }, [supabase])

  // Load templates
  React.useEffect(() => {
    if (open) {
      loadTemplates()
    }
  }, [open, loadTemplates])

  const handleCreateTemplate = async () => {
    if (!newTemplate.name || !newTemplate.content) {
      toast.error("Please fill in all fields")
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data: userOrg } = await supabase
      .from('user_roles')
      .select('organization_id')
      .eq('id', session.user.id)
      .single()

    if (!userOrg) {
      toast.error("Could not find your organization")
      return
    }

    const { error } = await supabase
      .from('message_templates')
      .insert({
        name: newTemplate.name,
        content: newTemplate.content,
        created_by: session.user.id,
        organization_id: userOrg.organization_id,
      })

    if (error) {
      console.error('Error creating template:', error)
      toast.error("Failed to create template")
      return
    }

    toast.success("Template created successfully")
    setNewTemplate({ name: "", content: "" })
    loadTemplates()
  }

  const handleDeleteTemplate = async (id: string) => {
    const { error } = await supabase
      .from('message_templates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting template:', error)
      toast.error("Failed to delete template")
      return
    }

    toast.success("Template deleted successfully")
    loadTemplates()
  }

  const handleInsertTemplate = (template: { content: string }) => {
    if (onInsert) {
      onInsert(template)
      setOpen(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || <Button variant="outline">Manage Templates</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Message Templates</DialogTitle>
          <DialogDescription>
            Create and manage your message templates. Use variables like {'{first_name}'}, {'{last_name}'}, {'{email}'}, and {'{company_name}'} to personalize your messages.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Template Name</Label>
            <Input
              id="name"
              value={newTemplate.name}
              onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter template name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Template Content</Label>
            <Textarea
              id="content"
              value={newTemplate.content}
              onChange={(e) => setNewTemplate(prev => ({ ...prev, content: e.target.value }))}
              placeholder="Enter template content"
              className="min-h-[100px]"
            />
          </div>

          <Button onClick={handleCreateTemplate} className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Button>

          <div className="space-y-2">
            <h3 className="font-medium">Your Templates</h3>
            {templates.map((template) => (
              <div key={template.id} className="flex items-center justify-between p-2 border rounded-lg hover:bg-gray-50">
                <span className="font-medium">{template.name}</span>
                <div className="flex items-center space-x-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleInsertTemplate(template)}
                    className="h-8 w-8 hover:bg-gray-100"
                  >
                    <ArrowRight className="h-4 w-4 text-gray-500" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteTemplate(template.id)}
                    className="h-8 w-8 hover:bg-gray-100"
                  >
                    <Trash2 className="h-4 w-4 text-gray-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
} 