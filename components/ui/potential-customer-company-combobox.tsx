"use client"

import { BaseCompanyCombobox } from "./company-combobox"
import type { Company } from "./company-combobox"

interface PotentialCustomerCompanyComboboxProps {
  companies: Company[]
  value?: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
}

export function PotentialCustomerCompanyCombobox({
  companies,
  value,
  onChange,
  disabled = false,
}: PotentialCustomerCompanyComboboxProps) {
  return (
    <BaseCompanyCombobox
      companies={companies}
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder="Select potential customer company..."
      searchPlaceholder="Search potential customer companies..."
    />
  )
} 