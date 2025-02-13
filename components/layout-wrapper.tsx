"use client"

import { NavBar } from "@/components/nav-bar"

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar />
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">{children}</main>
    </>
  )
} 