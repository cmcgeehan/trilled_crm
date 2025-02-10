"use client"

import { useState } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

// Mock data
const customers = [
  { id: 1, name: "John Doe", phone: "123-456-7890", email: "john@example.com", isLead: false, status: "New" },
  { id: 2, name: "Jane Smith", phone: "098-765-4321", email: "jane@example.com", isLead: true, status: "Needs Action" },
  {
    id: 3,
    name: "Alice Johnson",
    phone: "555-555-5555",
    email: "alice@example.com",
    isLead: false,
    status: "Follow Up",
  },
  {
    id: 4,
    name: "Bob Williams",
    phone: "444-444-4444",
    email: "bob@example.com",
    isLead: true,
    status: "Awaiting Response",
  },
]

export default function CustomersPage() {
  const [searchTerm, setSearchTerm] = useState("")

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone.includes(searchTerm) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Customers</h1>
      <Input
        type="text"
        placeholder="Search by name, phone, or email"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="max-w-md"
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredCustomers.map((customer) => (
            <TableRow key={customer.id}>
              <TableCell>{customer.name}</TableCell>
              <TableCell>{customer.phone}</TableCell>
              <TableCell>{customer.email}</TableCell>
              <TableCell>
                <Badge variant={customer.isLead ? "secondary" : "default"}>
                  {customer.isLead ? "Lead" : "Customer"}
                </Badge>
              </TableCell>
              <TableCell>{customer.status}</TableCell>
              <TableCell>
                <Button asChild>
                  <Link href={`/customers/${customer.id}`}>View Details</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

