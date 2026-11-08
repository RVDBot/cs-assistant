import { NextRequest, NextResponse } from 'next/server'
import { getSecret } from '@/lib/security'
import { AUTH_COOKIE, readToken, needsRefresh, signToken, authCookieOptions } from '@/lib/auth-token'

export const runtime = 'nodejs'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always allow login page, auth API and Twilio webhook
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/api/twilio/webhook' ||
    pathname === '/api/twilio/status'
  ) {
    return NextResponse.next()
  }

  const token = req.cookies.get(AUTH_COOKIE)?.value
  const issuedAt = token ? await readToken(token, getSecret()) : null
  if (issuedAt !== null) {
    const res = NextResponse.next()
    // Sliding session: while the app is in use, re-issue the cookie (at most daily),
    // so you are only logged out after 30 days without opening it
    if (needsRefresh(issuedAt)) {
      res.cookies.set(AUTH_COOKIE, await signToken(getSecret()), authCookieOptions())
    }
    return res
  }

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|.*\\.png$).*)'],
}
