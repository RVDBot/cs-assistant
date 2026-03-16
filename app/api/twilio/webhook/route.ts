import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { detectLanguage, translateToDutch } from '@/lib/claude'
import { log } from '@/lib/logger'
import { validateTwilioSignature } from '@/lib/security'

const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const params = Object.fromEntries(new URLSearchParams(body))

  // C3 fix: validate Twilio webhook signature
  const signature = req.headers.get('x-twilio-signature') || ''
  const baseUrl = process.env.BASE_URL || ''
  if (baseUrl) {
    const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/twilio/webhook`
    if (!validateTwilioSignature(webhookUrl, params, signature)) {
      log('error', 'twilio', 'Ongeldige webhook signature', { ip: req.headers.get('x-forwarded-for') })
      return new NextResponse('Forbidden', { status: 403 })
    }
  }

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
    // L2 fix: validate reaction is bounded
    if (reactionEmoji.length > 20) {
      return new NextResponse('Bad Request', { status: 400 })
    }

    const msg = db.prepare('SELECT id, reactions FROM messages WHERE twilio_sid = ?').get(reactionMessageSid) as
      { id: number; reactions: string } | undefined

    if (msg) {
      const existing: string[] = JSON.parse(msg.reactions || '[]')
      if (!existing.includes(reactionEmoji)) {
        existing.push(reactionEmoji)
        db.prepare('UPDATE messages SET reactions = ? WHERE id = ?').run(JSON.stringify(existing), msg.id)
        log('info', 'bericht', `Reactie ontvangen: ${reactionEmoji}`, { from, reactionMessageSid })
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
    language = await detectLanguage(messageBody, conv.id)
    dutchContent = await translateToDutch(messageBody, language, conv.id)
    if (language !== conv.detected_language) {
      db.prepare('UPDATE conversations SET detected_language = ? WHERE id = ?').run(language, conv.id)
    }
  } catch (e) {
    console.error('Translation error:', e)
    log('error', 'ai', 'Vertaling mislukt', { error: String(e), from }, conv.id)
  }

  db.prepare(`
    INSERT INTO messages (conversation_id, direction, content, content_dutch, language, twilio_sid, status)
    VALUES (?, 'inbound', ?, ?, ?, ?, 'received')
  `).run(conv.id, messageBody, dutchContent, language, messageSid)

  log('info', 'bericht', `Inkomend bericht ontvangen (${language.toUpperCase()})`, { from, sid: messageSid }, conv.id)

  return new NextResponse(TWIML_EMPTY, { headers: { 'Content-Type': 'text/xml' } })
}
