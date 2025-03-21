"use client"

import * as React from "react"
import { Send, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { MessageTemplatesDialog } from "@/components/message-templates-dialog"

interface MessageInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder?: string
  className?: string
  customer?: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    companies?: {
      id: string
      name: string
    } | null
  }
  responseChannel: string
  onResponseChannelChange: (value: string) => void
}

export function MessageInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Type your message...",
  className,
  customer,
  responseChannel,
  onResponseChannelChange,
}: MessageInputProps) {
  const [showCommandPalette, setShowCommandPalette] = React.useState(false)
  const [templates, setTemplates] = React.useState<Array<{
    id: string
    name: string
    content: string
  }>>([])
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const supabase = createClientComponentClient()

  // Load templates
  React.useEffect(() => {
    const loadTemplates = async () => {
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
    }

    loadTemplates()
  }, [supabase])

  // Handle template insertion
  const handleTemplateSelect = (template: { content: string }) => {
    let content = template.content

    // Replace variables
    if (customer) {
      content = content
        .replace(/\{first_name\}/g, customer.first_name || '')
        .replace(/\{last_name\}/g, customer.last_name || '')
        .replace(/\{email\}/g, customer.email || '')
        .replace(/\{company_name\}/g, customer.companies?.name || '')
    }

    onChange(content)
    setShowCommandPalette(false)
    // Refocus the textarea after template insertion
    textareaRef.current?.focus()
  }

  // Handle keydown events
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
    } else if (e.key === '/' && !showCommandPalette) {
      e.preventDefault()
      setShowCommandPalette(true)
    } else if (e.key === 'Escape' && showCommandPalette) {
      e.preventDefault()
      setShowCommandPalette(false)
      textareaRef.current?.focus()
    }
  }

  return (
    <div className={cn("relative w-full", className)}>
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-h-[100px] pr-[200px] pl-4 py-3"
        />
        <div className="absolute bottom-3 right-3 flex items-center space-x-2">
          <Select value={responseChannel} onValueChange={onResponseChannelChange}>
            <SelectTrigger className="h-8 w-[100px] text-sm bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="internal">Internal</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center space-x-1">
            <MessageTemplatesDialog
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-gray-100"
                >
                  <FileText className="h-4 w-4 text-gray-500" />
                </Button>
              }
              onInsert={handleTemplateSelect}
            />
            <Button
              size="icon"
              className="h-8 w-8 bg-brand-darkBlue hover:bg-brand-darkBlue/90"
              onClick={onSubmit}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Popover open={showCommandPalette} onOpenChange={setShowCommandPalette}>
        <PopoverTrigger asChild>
          <div className="absolute bottom-0 left-0" />
        </PopoverTrigger>
        <PopoverContent 
          className="w-[400px] p-0" 
          align="start" 
          side="top"
          alignOffset={-60}
          sideOffset={-15}
        >
          <Command>
            <CommandInput placeholder="Search templates..." autoFocus />
            <CommandList>
              <CommandEmpty>No templates found.</CommandEmpty>
              <CommandGroup heading="Templates">
                {templates.map((template) => (
                  <CommandItem
                    key={template.id}
                    onSelect={() => handleTemplateSelect(template)}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{template.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {template.content.substring(0, 50)}...
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
} 