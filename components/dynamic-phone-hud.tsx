'use client'

import dynamic from 'next/dynamic'

// Dynamically import PhoneHUD with ssr: false
const DynamicPhoneHUD = dynamic(
  () => import('@/components/phone/phone-hud').then((mod) => mod.PhoneHUD),
  { 
    ssr: false,
    // Optional: Add a loading state while the component is fetched
    loading: () => <p>Loading Phone...</p> 
  }
)

export function DynamicPhoneHUDWrapper() {
  // This client component just renders the dynamically imported PhoneHUD
  return <DynamicPhoneHUD />;
} 