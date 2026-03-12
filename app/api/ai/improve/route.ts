import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { improveAnswer } from '@/lib/claude'

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

  try {
    const result = await improveAnswer({
      currentAnswer: current_answer,
      instruction,
      customerMessage: lastInbound?.content || '',
      customerLanguage: conv.detected_language,
      conversationId: Number(conversation_id),
    })
    return NextResponse.json(result)
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error }, { status: 500 })
  }
}
