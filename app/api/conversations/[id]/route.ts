import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()

  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id)
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const messages = db.prepare(`
    SELECT * FROM messages WHERE conversation_id = ? ORDER BY sent_at ASC
  `).all(id)

  // Mark as read
  db.prepare('UPDATE conversations SET unread_count = 0 WHERE id = ?').run(id)

  return NextResponse.json({ conversation: conv, messages })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const db = getDb()

  if (body.customer_name !== undefined) {
    db.prepare('UPDATE conversations SET customer_name = ? WHERE id = ?').run(body.customer_name, id)
  }

  return NextResponse.json({ ok: true })
}
