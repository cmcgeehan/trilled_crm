import "./globals.css"
import { Inter } from "next/font/google"
import { OrganizationProvider } from "@/lib/context/organization-context"
import { UserProvider } from "@/lib/context/user-context"
import { LayoutWrapper } from "@/components/layout-wrapper"
import { DynamicPhoneHUDWrapper } from '@/components/dynamic-phone-hud'

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
})

export const metadata = {
  title: "Trilled CRM",
  description: "Customer Relationship Management System",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <UserProvider>
          <OrganizationProvider>
            <div className="min-h-screen bg-gray-100">
              <LayoutWrapper>{children}</LayoutWrapper>
              <DynamicPhoneHUDWrapper />
            </div>
          </OrganizationProvider>
        </UserProvider>
      </body>
    </html>
  )
}

