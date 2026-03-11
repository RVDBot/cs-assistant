import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()
  const links = db.prepare('SELECT id, url, title, created_at FROM context_links ORDER BY created_at DESC').all()
  return NextResponse.json(links)
}

export async function POST(req: NextRequest) {
  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  // Fetch the page content
  let title: string | null = null
  let content: string | null = null
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CS-Assistant/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    const html = await response.text()

    // Basic extraction without cheerio (use regex)
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    title = titleMatch ? titleMatch[1].trim() : url

    // Strip HTML tags and get text
    content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 10000) // Limit to 10k chars
  } catch (e) {
    console.error('Failed to fetch URL:', e)
    title = url
    content = null
  }

  const db = getDb()
  try {
    const result = db.prepare('INSERT INTO context_links (url, title, content) VALUES (?, ?, ?)').run(url, title, content)
    return NextResponse.json({ id: result.lastInsertRowid, title })
  } catch {
    return NextResponse.json({ error: 'URL already exists' }, { status: 409 })
  }
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = getDb()
  db.prepare('DELETE FROM context_links WHERE id = ?').run(id)
  return NextResponse.json({ ok: true })
}
