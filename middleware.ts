import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

function getSecret() {
  return process.env.NEXTAUTH_SECRET || 'change-me-in-production'
}

function verifyToken(token: string): boolean {
  try {
    const lastDot = token.lastIndexOf('.')
    if (lastDot === -1) return false
    const value = token.slice(0, lastDot)
    const sig = token.slice(lastDot + 1)
    const expected = crypto.createHmac('sha256', getSecret()).update(value).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always allow login page and auth API
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  // Allow Twilio webhook without auth (called by Twilio's servers)
  if (pathname === '/api/twilio/webhook') {
    return NextResponse.next()
  }

  const token = req.cookies.get('cs_auth')?.value
  if (token && verifyToken(token)) {
    return NextResponse.next()
  }

  // Redirect to login
  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
