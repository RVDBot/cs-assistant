import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/twilio'
import { log } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { conversation_id, content } = body

  if (!conversation_id || !content) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const db = getDb()
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversation_id) as {
    id: number; customer_phone: string; detected_language: string
  } | undefined

  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  let twilioSid: string | null = null
  try {
    twilioSid = await sendWhatsAppMessage(conv.customer_phone, content)
    log('info', 'twilio', 'Handmatig bericht verstuurd via Twilio', { sid: twilioSid, to: conv.customer_phone }, conversation_id)
  } catch (e) {
    log('error', 'twilio', 'Handmatig versturen via Twilio mislukt', { error: e instanceof Error ? e.message : String(e) }, conversation_id)
  }
  log('info', 'bericht', 'Handmatig bericht verstuurd', { demo: !twilioSid }, conversation_id)

  const result = db.prepare(`
    INSERT INTO messages (conversation_id, direction, content, content_customer_lang, language, twilio_sid, status)
    VALUES (?, 'outbound', ?, ?, ?, ?, ?)
  `).run(conversation_id, content, content, conv.detected_language, twilioSid, twilioSid ? 'sent' : 'demo')

  db.prepare(`
    UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, last_message = ? WHERE id = ?
  `).run(content.slice(0, 100), conversation_id)

  return NextResponse.json({ id: result.lastInsertRowid, twilio_sid: twilioSid })
}
