import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()
  const files = db.prepare('SELECT id, name, file_type, created_at FROM context_files ORDER BY created_at DESC').all()
  return NextResponse.json(files)
}

export async function POST(req: NextRequest) {
  const { name, content, file_type } = await req.json()
  if (!name || !content) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const db = getDb()
  const result = db.prepare('INSERT INTO context_files (name, content, file_type) VALUES (?, ?, ?)').run(name, content, file_type || null)
  return NextResponse.json({ id: result.lastInsertRowid })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = getDb()
  db.prepare('DELETE FROM context_files WHERE id = ?').run(id)
  return NextResponse.json({ ok: true })
}
