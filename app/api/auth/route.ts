import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const SECRET = process.env.NEXTAUTH_SECRET || 'change-me-in-production'

function getPassword(): string {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_password') as { value: string } | undefined
  return row?.value || process.env.APP_PASSWORD || ''
}

async function signToken(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  const b64sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
  return `${value}.${b64sig}`
}

// POST /api/auth — login
export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const correct = getPassword()

  if (correct && password !== correct) {
    return NextResponse.json({ error: 'Ongeldig wachtwoord' }, { status: 401 })
  }

  const token = await signToken('authenticated')
  const res = NextResponse.json({ ok: true })
  res.cookies.set('cs_auth', token, {
    httpOnly: true,
    sameSite: 'lax',
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
