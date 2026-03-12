import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { detectLanguage, translateToDutch } from '@/lib/claude'

const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const params = Object.fromEntries(new URLSearchParams(body))

  const from: string = params.From || ''
  const messageBody: string = params.Body || ''
  const messageSid: string = params.MessageSid || ''
  const reactionEmoji: string = params.ReactionEmoji || ''
  const reactionMessageSid: string = params.ReactionMessageSid || ''

  if (!from) {
    return new NextResponse('Bad Request', { status: 400 })
  }

  const db = getDb()

  // Handle incoming reaction
  if (reactionEmoji && reactionMessageSid) {
    const msg = db.prepare('SELECT id, reactions FROM messages WHERE twilio_sid = ?').get(reactionMessageSid) as
      { id: number; reactions: string } | undefined

    if (msg) {
      const existing: string[] = JSON.parse(msg.reactions || '[]')
      if (!existing.includes(reactionEmoji)) {
        existing.push(reactionEmoji)
        db.prepare('UPDATE messages SET reactions = ? WHERE id = ?').run(JSON.stringify(existing), msg.id)
      }
    }
    return new NextResponse(TWIML_EMPTY, { headers: { 'Content-Type': 'text/xml' } })
  }

  // Regular message — require body
  if (!messageBody) {
    return new NextResponse(TWIML_EMPTY, { headers: { 'Content-Type': 'text/xml' } })
  }

  // Upsert conversation
  db.prepare(`
    INSERT INTO conversations (customer_phone, updated_at, last_message, unread_count)
    VALUES (?, CURRENT_TIMESTAMP, ?, 1)
    ON CONFLICT(customer_phone) DO UPDATE SET
      updated_at   = CURRENT_TIMESTAMP,
      last_message = excluded.last_message,
      unread_count = unread_count + 1
  `).run(from, messageBody.slice(0, 100))

  const conv = db.prepare('SELECT id, detected_language FROM conversations WHERE customer_phone = ?').get(from) as {
    id: number; detected_language: string
  }

  let language = conv.detected_language || 'en'
  let dutchContent = messageBody

  try {
    language = await detectLanguage(messageBody)
    dutchContent = await translateToDutch(messageBody, language)
    if (language !== conv.detected_language) {
      db.prepare('UPDATE conversations SET detected_language = ? WHERE id = ?').run(language, conv.id)
    }
  } catch (e) {
    console.error('Translation error:', e)
  }

  db.prepare(`
    INSERT INTO messages (conversation_id, direction, content, content_dutch, language, twilio_sid, status)
    VALUES (?, 'inbound', ?, ?, ?, ?, 'received')
  `).run(conv.id, messageBody, dutchContent, language, messageSid)

  return new NextResponse(TWIML_EMPTY, { headers: { 'Content-Type': 'text/xml' } })
}
