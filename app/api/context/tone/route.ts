import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()
  const row = db.prepare('SELECT prompt FROM tone_of_voice WHERE id = 1').get() as { prompt: string } | undefined
  return NextResponse.json({ prompt: row?.prompt || '' })
}

export async function PUT(req: NextRequest) {
  const { prompt } = await req.json()
  const db = getDb()
  db.prepare('UPDATE tone_of_voice SET prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(prompt || '')
  return NextResponse.json({ ok: true })
}
