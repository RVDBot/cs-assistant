import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const idNum = Number(id)
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }
  const db = getDb()

  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(idNum)
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const messages = db.prepare(`
    SELECT * FROM messages WHERE conversation_id = ? ORDER BY sent_at ASC
  `).all(idNum)

  // Mark as read
  db.prepare('UPDATE conversations SET unread_count = 0 WHERE id = ?').run(idNum)

  return NextResponse.json({ conversation: conv, messages })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const idNum = Number(id)
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }
  const body = await req.json()
  const db = getDb()

  if (body.customer_name !== undefined) {
    db.prepare('UPDATE conversations SET customer_name = ? WHERE id = ?').run(body.customer_name, idNum)
  }

  if (body.is_archived !== undefined) {
    db.prepare('UPDATE conversations SET is_archived = ? WHERE id = ?').run(body.is_archived ? 1 : 0, idNum)
  }

  return NextResponse.json({ ok: true })
}
