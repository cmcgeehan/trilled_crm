"use client"

import { Inter } from "next/font/google"
import { NavBar } from "@/components/nav-bar"

const inter = Inter({ subsets: ["latin"] })

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <body className={`${inter.className} antialiased`}>
      <div className="min-h-screen bg-gray-100">
        <NavBar />
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </body>
  )
} 