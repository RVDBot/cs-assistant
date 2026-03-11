import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/twilio'

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
  } catch (e) {
    console.error('Twilio send error:', e)
    // Continue even if Twilio fails (for demo mode)
  }

  const result = db.prepare(`
    INSERT INTO messages (conversation_id, direction, content, content_customer_lang, language, twilio_sid, status)
    VALUES (?, 'outbound', ?, ?, ?, ?, 'sent')
  `).run(conversation_id, content, content, conv.detected_language, twilioSid, twilioSid ? 'sent' : 'failed')

  db.prepare(`
    UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, last_message = ? WHERE id = ?
  `).run(content.slice(0, 100), conversation_id)

  return NextResponse.json({ id: result.lastInsertRowid, twilio_sid: twilioSid })
}
