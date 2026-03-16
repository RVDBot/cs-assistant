import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { improveAnswer } from '@/lib/claude'
import { validateExternalUrl } from '@/lib/security'
import { log } from '@/lib/logger'

function extractUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s]+/g) || []
}

async function fetchPageText(url: string): Promise<string> {
  try {
    // H3 fix: validate URL before fetching
    const check = validateExternalUrl(url)
    if (!check.valid) return ''

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CS-Assistant/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    const html = await res.text()
    // Strip tags, collapse whitespace, limit length
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000)
    return text
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest) {
  const { conversation_id, current_answer, instruction } = await req.json()

  if (!conversation_id || !current_answer || !instruction) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const db = getDb()
  const conv = db.prepare('SELECT detected_language FROM conversations WHERE id = ?').get(conversation_id) as {
    detected_language: string
  } | undefined

  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const lastInbound = db.prepare(`
    SELECT content FROM messages WHERE conversation_id = ? AND direction = 'inbound'
    ORDER BY sent_at DESC LIMIT 1
  `).get(conversation_id) as { content: string } | undefined

  // Fetch any URLs mentioned in the instruction so Claude can use the content
  const urls = extractUrls(instruction)
  const fetchedPages: { url: string; content: string }[] = []
  for (const url of urls) {
    const content = await fetchPageText(url)
    if (content) fetchedPages.push({ url, content })
  }

  try {
    const result = await improveAnswer({
      currentAnswer: current_answer,
      instruction,
      customerMessage: lastInbound?.content || '',
      customerLanguage: conv.detected_language,
      conversationId: Number(conversation_id),
      fetchedPages,
    })
    return NextResponse.json(result)
  } catch (e) {
    log('error', 'ai', 'Antwoord verbeteren mislukt', { error: e instanceof Error ? e.message : String(e) }, Number(conversation_id))
    return NextResponse.json({ error: 'Er ging iets mis bij het verbeteren.' }, { status: 500 })
  }
}
