import "./globals.css"
import { LayoutWrapper } from "@/components/layout-wrapper"

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
      <LayoutWrapper>{children}</LayoutWrapper>
    </html>
  )
}

