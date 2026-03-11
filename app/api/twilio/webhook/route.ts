import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { detectLanguage, translateToDutch } from '@/lib/claude'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const params = Object.fromEntries(new URLSearchParams(body))

  const from: string = params.From || ''
  const messageBody: string = params.Body || ''
  const messageSid: string = params.MessageSid || ''

  if (!from || !messageBody) {
    return new NextResponse('Bad Request', { status: 400 })
  }

  const db = getDb()

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

  // Detect language asynchronously (don't block the response to Twilio)
  let language = conv.detected_language || 'en'
  let dutchContent = messageBody

  try {
    language = await detectLanguage(messageBody)
    dutchContent = await translateToDutch(messageBody, language)

    // Update conversation language if changed
    if (language !== conv.detected_language) {
      db.prepare('UPDATE conversations SET detected_language = ? WHERE id = ?').run(language, conv.id)
    }
  } catch (e) {
    console.error('Translation error:', e)
  }

  // Save inbound message
  db.prepare(`
    INSERT INTO messages (conversation_id, direction, content, content_dutch, language, twilio_sid, status)
    VALUES (?, 'inbound', ?, ?, ?, ?, 'received')
  `).run(conv.id, messageBody, dutchContent, language, messageSid)

  // Respond with empty TwiML (no auto-reply)
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { headers: { 'Content-Type': 'text/xml' } }
  )
}
