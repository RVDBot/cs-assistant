import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()
  const conversations = db.prepare(`
    SELECT * FROM conversations ORDER BY updated_at DESC
  `).all()
  return NextResponse.json(conversations)
}
