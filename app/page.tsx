import { Suspense } from "react"
import AuthHandler from "../components/auth-handler"

export default function RootPage() {
  return (
    <Suspense fallback={
      <div className="container flex items-center justify-center min-h-screen py-12">
        <p>Loading...</p>
      </div>
    }>
      <AuthHandler />
    </Suspense>
  )
}

