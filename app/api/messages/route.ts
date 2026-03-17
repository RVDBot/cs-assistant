import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/twilio'
import { sendEmail, getAccountForConversation } from '@/lib/email'
import { log } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { conversation_id, content, channel } = body

  if (!conversation_id || !content) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const db = getDb()
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversation_id) as {
    id: number; customer_phone: string | null; customer_email: string | null; detected_language: string
  } | undefined

  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  const sendChannel = channel || (conv.customer_phone ? 'whatsapp' : 'email')

  let twilioSid: string | null = null
  let emailMessageId: string | null = null
  let emailSubject: string | null = null
  let emailAccountId: number | null = null

  if (sendChannel === 'email' && conv.customer_email) {
    // Get last email subject for threading
    const lastEmail = db.prepare(
      `SELECT email_subject, email_message_id FROM messages WHERE conversation_id = ? AND channel = 'email' ORDER BY sent_at DESC LIMIT 1`
    ).get(conversation_id) as { email_subject: string | null; email_message_id: string | null } | undefined

    emailSubject = lastEmail?.email_subject
      ? (lastEmail.email_subject.startsWith('Re: ') ? lastEmail.email_subject : `Re: ${lastEmail.email_subject}`)
      : 'Reactie van SpeedRope Shop'
    const inReplyTo = lastEmail?.email_message_id || undefined
    const account = getAccountForConversation(conversation_id)

    try {
      const result = await sendEmail(conv.customer_email, emailSubject, content, inReplyTo, account?.id)
      emailMessageId = result.messageId
      emailAccountId = result.accountId
      log('info', 'bericht', 'Handmatig email verstuurd', { to: conv.customer_email, account: account?.name }, conversation_id)
    } catch (e) {
      log('error', 'bericht', 'Handmatig email versturen mislukt', { error: e instanceof Error ? e.message : String(e) }, conversation_id)
    }
  } else if (conv.customer_phone) {
    try {
      twilioSid = await sendWhatsAppMessage(conv.customer_phone, content)
      log('info', 'twilio', 'Handmatig bericht verstuurd via Twilio', { sid: twilioSid, to: conv.customer_phone }, conversation_id)
    } catch (e) {
      log('error', 'twilio', 'Handmatig versturen via Twilio mislukt', { error: e instanceof Error ? e.message : String(e) }, conversation_id)
    }
  }

  const sent = !!(twilioSid || emailMessageId)
  log('info', 'bericht', 'Handmatig bericht verstuurd', { demo: !sent, channel: sendChannel }, conversation_id)

  const result = db.prepare(`
    INSERT INTO messages (conversation_id, direction, content, content_customer_lang, language, twilio_sid, status, channel, email_subject, email_message_id, email_account_id)
    VALUES (?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(conversation_id, content, content, conv.detected_language, twilioSid, sent ? 'sent' : 'demo', sendChannel, emailSubject, emailMessageId, emailAccountId)

  db.prepare(`
    UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, last_message = ? WHERE id = ?
  `).run(content.slice(0, 100), conversation_id)

  return NextResponse.json({ id: result.lastInsertRowid, twilio_sid: twilioSid })
}
