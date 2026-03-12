import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest) {
  const db = getDb()
  const level = req.nextUrl.searchParams.get('level') || ''
  const category = req.nextUrl.searchParams.get('category') || ''
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || '200'), 500)

  const conditions: string[] = []
  const params: (string | number)[] = []

  if (level) { conditions.push('level = ?'); params.push(level) }
  if (category) { conditions.push('category = ?'); params.push(category) }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const rows = db.prepare(`
    SELECT l.id, l.level, l.category, l.message, l.meta, l.created_at,
           c.customer_name, c.customer_phone
    FROM logs l
    LEFT JOIN conversations c ON c.id = l.conversation_id
    ${where}
    ORDER BY l.id DESC
    LIMIT ?
  `).all(...params, limit) as {
    id: number
    level: string
    category: string
    message: string
    meta: string | null
    created_at: string
    customer_name: string | null
    customer_phone: string | null
  }[]

  return NextResponse.json({ logs: rows })
}

export async function DELETE() {
  getDb().prepare('DELETE FROM logs').run()
  return NextResponse.json({ ok: true })
}
