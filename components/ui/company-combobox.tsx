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

export type Company = {
  id: string
  name: string | null
  // Allow other properties from the database with specific types
  [key: string]: string | null | undefined | Date
}

interface CompanyComboboxProps {
  companies: Company[]
  value?: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
}

export function CompanyCombobox({
  companies,
  value,
  onChange,
  disabled = false,
}: CompanyComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")

  // Debug: Log when companies prop changes
  React.useEffect(() => {
    console.log('CompanyCombobox:', {
      disabled,
      companiesLength: companies.length,
      value,
      open
    });
  }, [companies.length, disabled, value, open]);

  const filteredCompanies = React.useMemo(() => {
    if (!searchQuery) return companies;
    
    const lowerQuery = searchQuery.toLowerCase().trim();
    console.log('Filtering with query:', lowerQuery);
    
    const filtered = companies.filter((company) => {
      const companyName = company.name?.toLowerCase() || '';
      return companyName.includes(lowerQuery);
    });
    
    console.log('Filtered results:', filtered.length, 'companies');
    return filtered;
  }, [companies, searchQuery])

  const selectedCompany = companies.find((company) => company.id === value)

  const handleSelect = React.useCallback((companyId: string | null, companyName?: string) => {
    console.log('Handling selection:', { companyId, companyName });
    if (!disabled) {
      onChange(companyId);
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
          {value ? (selectedCompany?.name || 'Unnamed Company') : "Select company..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="flex items-center border-b px-3">
          <input
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Search companies..."
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
            No Company
          </div>
          {filteredCompanies.map((company) => (
            <div
              key={company.id}
              role="button"
              onClick={() => handleSelect(company.id, company.name || undefined)}
              className={cn(
                "flex items-center rounded-sm px-2 py-1.5 text-sm",
                !disabled && "cursor-pointer hover:bg-accent hover:text-accent-foreground",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <Check
                className={cn(
                  "mr-2 h-4 w-4",
                  value === company.id ? "opacity-100" : "opacity-0"
                )}
              />
              {company.name || 'Unnamed Company'}
            </div>
          ))}
          {filteredCompanies.length === 0 && (
            <div className="py-6 text-center text-sm">No companies found.</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
} 