import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const SETTING_KEYS = [
  'twilio_account_sid',
  'twilio_auth_token',
  'twilio_phone_number',
  'anthropic_api_key',
  'claude_model',
]

export async function GET() {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const settings: Record<string, string> = {}
  for (const row of rows) {
    // Mask sensitive values
    if (row.key === 'twilio_auth_token' || row.key === 'anthropic_api_key') {
      settings[row.key] = row.value ? '••••••••' + row.value.slice(-4) : ''
    } else {
      settings[row.key] = row.value
    }
  }
  return NextResponse.json(settings)
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const db = getDb()

  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `)

  for (const key of SETTING_KEYS) {
    if (body[key] !== undefined) {
      // Don't overwrite masked values
      if (body[key].includes('••••')) continue
      upsert.run(key, body[key])
    }
  }

  return NextResponse.json({ ok: true })
}
