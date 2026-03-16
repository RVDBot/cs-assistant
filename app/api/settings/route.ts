import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { hashPassword } from '@/lib/security'

const SETTING_KEYS = [
  'twilio_account_sid',
  'twilio_auth_token',
  'twilio_phone_number',
  'base_url',
  'anthropic_api_key',
  'claude_model',
  'app_password',
  'wc_store_url',
  'wc_consumer_key',
  'wc_consumer_secret',
]

const SENSITIVE_KEYS = ['twilio_auth_token', 'anthropic_api_key', 'app_password', 'wc_consumer_secret']

export async function GET() {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const settings: Record<string, string> = {}
  for (const row of rows) {
    // H6 fix: fully mask sensitive values, don't leak any characters
    if (SENSITIVE_KEYS.includes(row.key)) {
      settings[row.key] = row.value ? '••••••••' : ''
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
      // Don't overwrite with masked placeholder
      if (body[key] === '••••••••') continue

      let value = body[key]

      // H1 fix: hash password before storing
      if (key === 'app_password' && value) {
        value = hashPassword(value)
      }

      upsert.run(key, value)
    }
  }

  return NextResponse.json({ ok: true })
}
