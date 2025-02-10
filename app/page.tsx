import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

// Mock data
const metrics = {
  needsAction: 5,
  timeToClose: "2.3 days",
  csat: "4.7/5",
}

const queueItems = [
  { id: 1, name: "John Doe", status: "Needs Action" },
  { id: 2, name: "Jane Smith", status: "Follow Up" },
  { id: 3, name: "Alice Johnson", status: "New" },
  { id: 4, name: "Bob Williams", status: "Awaiting Response" },
]

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Needs Action</CardTitle>
            <CardDescription>Users requiring immediate attention</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{metrics.needsAction}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Avg. Time to Close</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{metrics.timeToClose}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>CSAT Score</CardTitle>
            <CardDescription>Customer Satisfaction</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{metrics.csat}</p>
          </CardContent>
        </Card>
      </div>
      <h2 className="text-xl font-semibold mt-6 mb-4">My Queue</h2>
      <div className="space-y-4">
        {queueItems.map((item) => (
          <Card key={item.id}>
            <CardContent className="flex justify-between items-center p-4">
              <div>
                <p className="font-semibold">{item.name}</p>
              </div>
              <div className="flex items-center space-x-2">
                <Badge variant="secondary">{item.status}</Badge>
                <Button asChild>
                  <Link href={`/customers/${item.id}?tab=cases`}>View Cases</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

