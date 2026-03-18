import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest) {
  const db = getDb()
  const archived = req.nextUrl.searchParams.get('archived') === '1'
  const conversations = db.prepare(`
    SELECT * FROM conversations WHERE is_archived = ? ORDER BY updated_at DESC
  `).all(archived ? 1 : 0)
  return NextResponse.json(conversations)
}
