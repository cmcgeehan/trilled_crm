import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  const type = url.searchParams.get('type')

  console.log('Initial verify received:', { token, type, url: url.toString() })

  // Construct the verification URL
  const verifyUrl = new URL('/auth/verify', url.origin)
  if (token) verifyUrl.searchParams.set('token', token)
  if (type) verifyUrl.searchParams.set('type', type)

  console.log('Redirecting to:', verifyUrl.toString())

  return NextResponse.redirect(verifyUrl)
} 