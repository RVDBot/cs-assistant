import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { generateAnswer } from '@/lib/claude'

export async function POST(req: NextRequest) {
  const { conversation_id } = await req.json()

  if (!conversation_id) {
    return NextResponse.json({ error: 'Missing conversation_id' }, { status: 400 })
  }

  const db = getDb()
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversation_id) as {
    id: number; customer_phone: string; detected_language: string
  } | undefined

  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Get all messages for context
  const messages = db.prepare(`
    SELECT direction, content, content_dutch FROM messages
    WHERE conversation_id = ?
    ORDER BY sent_at ASC
  `).all(conversation_id) as { direction: string; content: string; content_dutch: string | null }[]

  // Last inbound message
  const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound')
  if (!lastInbound) {
    return NextResponse.json({ error: 'No customer message found' }, { status: 400 })
  }

  // Build conversation history for Claude (last 20 messages)
  const history = messages.slice(-20).map(m => ({
    role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
    content: m.direction === 'inbound'
      ? `Customer (${conv.detected_language}): ${m.content}\nTranslation (NL): ${m.content_dutch || m.content}`
      : m.content,
  }))

  try {
    const result = await generateAnswer({
      customerMessage: lastInbound.content,
      customerMessageDutch: lastInbound.content_dutch || lastInbound.content,
      customerLanguage: conv.detected_language,
      conversationHistory: history.slice(0, -1), // exclude the last message, we pass it separately
    })
    return NextResponse.json(result)
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error }, { status: 500 })
  }
}
