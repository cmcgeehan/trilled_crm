import "./globals.css"
import { Inter } from "next/font/google"
import { OrganizationProvider } from "@/lib/context/organization-context"
import { LayoutWrapper } from "@/components/layout-wrapper"

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
        <OrganizationProvider>
          <div className="min-h-screen bg-gray-100">
            <LayoutWrapper>{children}</LayoutWrapper>
          </div>
        </OrganizationProvider>
      </body>
    </html>
  )
}

