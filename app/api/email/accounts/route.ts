import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const SENSITIVE_FIELDS = ['imap_password', 'smtp_password']

export async function GET() {
  const db = getDb()
  const accounts = db.prepare('SELECT * FROM email_accounts ORDER BY created_at ASC').all() as Record<string, unknown>[]

  // Mask sensitive fields
  const masked = accounts.map(acc => {
    const copy = { ...acc }
    for (const field of SENSITIVE_FIELDS) {
      if (copy[field]) copy[field] = '••••••••'
    }
    return copy
  })

  return NextResponse.json(masked)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, imap_host, imap_port, imap_user, imap_password, smtp_host, smtp_port, smtp_user, smtp_password, from_name } = body

  if (!name || !imap_user || !imap_password || !smtp_user || !smtp_password) {
    return NextResponse.json({ error: 'Verplichte velden ontbreken' }, { status: 400 })
  }

  const db = getDb()
  const result = db.prepare(`
    INSERT INTO email_accounts (name, imap_host, imap_port, imap_user, imap_password, smtp_host, smtp_port, smtp_user, smtp_password, from_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    imap_host || 'imap.gmail.com',
    imap_port || 993,
    imap_user,
    imap_password,
    smtp_host || 'smtp.gmail.com',
    smtp_port || 587,
    smtp_user,
    smtp_password,
    from_name || 'SpeedRope Shop',
  )

  return NextResponse.json({ id: result.lastInsertRowid })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...fields } = body

  if (!id) return NextResponse.json({ error: 'ID ontbreekt' }, { status: 400 })

  const db = getDb()
  const allowed = ['name', 'enabled', 'imap_host', 'imap_port', 'imap_user', 'imap_password', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'from_name']

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      // Don't overwrite password with masked placeholder
      if (fields[key] === '••••••••') continue
      db.prepare(`UPDATE email_accounts SET ${key} = ? WHERE id = ?`).run(fields[key], id)
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID ontbreekt' }, { status: 400 })

  const db = getDb()
  db.prepare('DELETE FROM email_accounts WHERE id = ?').run(id)
  return NextResponse.json({ ok: true })
}
