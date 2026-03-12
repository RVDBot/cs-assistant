import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getDb } from '@/lib/db'

function getSecret() {
  return process.env.NEXTAUTH_SECRET || 'change-me-in-production'
}

function getPassword(): string {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_password') as { value: string } | undefined
  return row?.value || process.env.APP_PASSWORD || ''
}

function signToken(value: string): string {
  const hmac = crypto.createHmac('sha256', getSecret())
  hmac.update(value)
  return value + '.' + hmac.digest('hex')
}

export function verifyToken(token: string): boolean {
  const lastDot = token.lastIndexOf('.')
  if (lastDot === -1) return false
  const value = token.slice(0, lastDot)
  const expected = signToken(value)
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
}

// POST /api/auth — login
export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const correct = getPassword()

  if (!correct) {
    // No password set — allow access
    const token = signToken('authenticated')
    const res = NextResponse.json({ ok: true })
    res.cookies.set('cs_auth', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 })
    return res
  }

  if (password !== correct) {
    return NextResponse.json({ error: 'Ongeldig wachtwoord' }, { status: 401 })
  }

  const token = signToken('authenticated')
  const res = NextResponse.json({ ok: true })
  res.cookies.set('cs_auth', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 })
  return res
}

// DELETE /api/auth — logout
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('cs_auth', '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
