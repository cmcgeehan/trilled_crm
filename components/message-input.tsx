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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

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
    owner?: {
      first_name: string | null
      last_name: string | null
      email: string | null
      position: string | null
    }
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
        .replace(/\{agent_first_name\}/g, customer.owner?.first_name || '')
        .replace(/\{agent_last_name\}/g, customer.owner?.last_name || '')
        .replace(/\{agent_email\}/g, customer.owner?.email || '')
        .replace(/\{agent_position\}/g, customer.owner?.position || '')
    }

    onChange(content)
    setShowCommandPalette(false)
    // Refocus the textarea after template insertion
    textareaRef.current?.focus()
  }

  // Handle keydown events
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      // Check for Command+Enter (Mac) or Control+Enter (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault()
        onSubmit()
        return
      }
      // Regular Enter without shift
      if (!e.shiftKey) {
        e.preventDefault()
        onSubmit()
      }
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
    <TooltipProvider>
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
            <div className="flex items-center gap-2">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <MessageTemplatesDialog
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-500 hover:text-gray-700"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      }
                      onInsert={handleTemplateSelect}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Message Templates</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="submit"
                      size="icon"
                      className="h-8 w-8 bg-brand-darkBlue hover:bg-brand-darkBlue/90 text-white"
                      disabled={!value.trim()}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Send Message</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
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
    </TooltipProvider>
  )
} 