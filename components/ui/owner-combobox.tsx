"use client"

import * as React from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"

export type Owner = {
  id: string
  email: string | null
  first_name: string | null
  role: string
}

interface OwnerComboboxProps {
  owners: Owner[]
  value?: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
}

export function OwnerCombobox({
  owners,
  value,
  onChange,
  disabled = false,
}: OwnerComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")

  const filteredOwners = React.useMemo(() => {
    if (!searchQuery) return owners;
    
    const lowerQuery = searchQuery.toLowerCase().trim();
    
    return owners.filter((owner) => {
      const ownerName = owner.first_name?.toLowerCase() || '';
      const ownerEmail = owner.email?.toLowerCase() || '';
      return ownerName.includes(lowerQuery) || ownerEmail.includes(lowerQuery);
    });
  }, [owners, searchQuery])

  const selectedOwner = owners.find((owner) => owner.id === value)

  const handleSelect = React.useCallback((ownerId: string | null) => {
    if (!disabled) {
      onChange(ownerId);
      setOpen(false);
      setSearchQuery("");
    }
  }, [disabled, onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between",
            disabled ? "cursor-not-allowed" : "cursor-pointer"
          )}
          disabled={disabled}
        >
          {value ? (
            selectedOwner
              ? `${selectedOwner.first_name || 'Agent'} (${selectedOwner.email || `User ${selectedOwner.id}`})`
              : 'Unassigned'
          ) : "Select owner..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="flex items-center border-b px-3">
          <input
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Search owners..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto p-1">
          <div
            role="button"
            onClick={() => handleSelect(null)}
            className={cn(
              "flex items-center rounded-sm px-2 py-1.5 text-sm",
              !disabled && "cursor-pointer hover:bg-accent hover:text-accent-foreground",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <Check
              className={cn(
                "mr-2 h-4 w-4",
                !value ? "opacity-100" : "opacity-0"
              )}
            />
            Unassigned
          </div>
          {filteredOwners.map((owner) => (
            <div
              key={owner.id}
              role="button"
              onClick={() => handleSelect(owner.id)}
              className={cn(
                "flex items-center rounded-sm px-2 py-1.5 text-sm",
                !disabled && "cursor-pointer hover:bg-accent hover:text-accent-foreground",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <Check
                className={cn(
                  "mr-2 h-4 w-4",
                  value === owner.id ? "opacity-100" : "opacity-0"
                )}
              />
              {owner.first_name || 'Agent'} ({owner.email || `User ${owner.id}`})
            </div>
          ))}
          {filteredOwners.length === 0 && (
            <div className="py-6 text-center text-sm">No owners found.</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
} 