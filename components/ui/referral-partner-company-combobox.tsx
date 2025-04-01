"use client"

import { BaseCompanyCombobox } from "./company-combobox"
import type { Company } from "./company-combobox"

interface ReferralPartnerCompanyComboboxProps {
  companies: Company[]
  value?: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
}

export function ReferralPartnerCompanyCombobox({
  companies,
  value,
  onChange,
  disabled = false,
}: ReferralPartnerCompanyComboboxProps) {
  return (
    <BaseCompanyCombobox
      companies={companies}
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder="Select referral partner company..."
      searchPlaceholder="Search referral partner companies..."
    />
  )
} 