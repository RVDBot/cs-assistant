import { NextRequest, NextResponse } from 'next/server'

const SECRET = process.env.NEXTAUTH_SECRET || 'change-me-in-production'

async function verifyToken(token: string): Promise<boolean> {
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return false
    const payload = token.slice(0, dot)
    const b64sig = token.slice(dot + 1)

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const signature = Uint8Array.from(atob(b64sig), c => c.charCodeAt(0))
    return await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(payload))
  } catch {
    return false
  }
}

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

  const token = req.cookies.get('cs_auth')?.value
  if (token && await verifyToken(token)) {
    return NextResponse.next()
  }

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
