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

interface BaseCompanyComboboxProps {
  companies: Company[]
  value?: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
  placeholder?: string
  searchPlaceholder?: string
  loading?: boolean
  error?: string | null
}

export function BaseCompanyCombobox({
  companies,
  value,
  onChange,
  disabled = false,
  placeholder = "Select company...",
  searchPlaceholder = "Search companies...",
  loading = false,
  error = null
}: BaseCompanyComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")

  const filteredCompanies = React.useMemo(() => {
    if (!searchQuery) return companies;
    
    const lowerQuery = searchQuery.toLowerCase().trim();
    
    return companies.filter((company) => {
      const companyName = company.name?.toLowerCase() || '';
      return companyName.includes(lowerQuery);
    });
  }, [companies, searchQuery])

  const selectedCompany = companies.find((company) => company.id === value)

  const handleSelect = React.useCallback((companyId: string | null) => {
    if (!disabled) {
      onChange(companyId);
      setOpen(false);
      setSearchQuery("");
    }
  }, [disabled, onChange]);

  const getCompanyDisplayName = (company: Company | undefined) => {
    if (!company) return placeholder;
    if (!company.name) return `Company ${company.id.slice(0, 8)}`;
    return company.name;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
            error && "border-red-500"
          )}
          disabled={disabled || loading}
        >
          {loading ? (
            <span className="text-muted-foreground">Loading companies...</span>
          ) : error ? (
            <span className="text-red-500">{error}</span>
          ) : (
            getCompanyDisplayName(selectedCompany)
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="flex items-center border-b px-3">
          <input
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto p-1">
          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Loading companies...
            </div>
          ) : error ? (
            <div className="py-6 text-center text-sm text-red-500">
              {error}
            </div>
          ) : (
            <>
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
                  onClick={() => handleSelect(company.id)}
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
                  {getCompanyDisplayName(company)}
                </div>
              ))}
              {filteredCompanies.length === 0 && (
                <div className="py-6 text-center text-sm">No companies found.</div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
} 