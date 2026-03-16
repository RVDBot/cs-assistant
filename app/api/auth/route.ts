import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getSecret, hashPassword, verifyPassword, checkRateLimit } from '@/lib/security'

function getStoredPassword(): string {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_password') as { value: string } | undefined
  return row?.value || process.env.APP_PASSWORD || ''
}

async function signToken(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const b64sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
  return `${payload}.${b64sig}`
}

// GET /api/auth — check if password is required
export async function GET() {
  const required = !!getStoredPassword()
  return NextResponse.json({ passwordRequired: required })
}

// POST /api/auth — login
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  // Rate limit: 5 attempts per minute per IP
  if (!checkRateLimit(`auth:${ip}`, 5, 60_000)) {
    return NextResponse.json(
      { error: 'Te veel pogingen. Probeer het over een minuut opnieuw.' },
      { status: 429 }
    )
  }

  const { password } = await req.json()
  const stored = getStoredPassword()

  // C2 fix: fail closed — if no password configured, deny access
  if (!stored) {
    return NextResponse.json(
      { error: 'Geen wachtwoord ingesteld. Stel een wachtwoord in via APP_PASSWORD environment variable.' },
      { status: 403 }
    )
  }

  // H1 fix: use constant-time comparison (supports both hashed and legacy plaintext)
  if (!verifyPassword(password || '', stored)) {
    return NextResponse.json({ error: 'Ongeldig wachtwoord' }, { status: 401 })
  }

  // Migrate plaintext password to hashed on successful login
  if (!stored.includes(':')) {
    const db = getDb()
    const hashed = hashPassword(password)
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(hashed, 'app_password')
  }

  // H5 fix: include timestamp in token payload for server-side expiry
  const payload = `authenticated|${Date.now()}`
  const token = await signToken(payload)
  const isProduction = process.env.NODE_ENV === 'production'

  const res = NextResponse.json({ ok: true })
  res.cookies.set('cs_auth', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction, // H2 fix
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return res
}

// DELETE /api/auth — logout
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('cs_auth', '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
