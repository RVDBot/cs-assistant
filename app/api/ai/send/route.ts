import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/twilio'
import { sendEmail } from '@/lib/email'
import { updateKnowledgeFromAnswer } from '@/lib/claude'
import { getKnowledgeFile, saveKnowledgeFile, KNOWLEDGE_TOPICS } from '@/lib/knowledge'
import { log } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const { conversation_id, answer_dutch, answer_customer_lang, channel } = await req.json()

  if (!conversation_id || !answer_customer_lang) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const db = getDb()
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversation_id) as {
    id: number; customer_phone: string | null; customer_email: string | null; detected_language: string
  } | undefined

  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const sendChannel = channel || (conv.customer_phone ? 'whatsapp' : 'email')

  let twilioSid: string | null = null
  let emailMessageId: string | null = null
  let emailSubject: string | null = null

  if (sendChannel === 'email' && conv.customer_email) {
    // Get last email subject for threading
    const lastEmail = db.prepare(
      `SELECT email_subject, email_message_id FROM messages WHERE conversation_id = ? AND channel = 'email' ORDER BY sent_at DESC LIMIT 1`
    ).get(conversation_id) as { email_subject: string | null; email_message_id: string | null } | undefined

    emailSubject = lastEmail?.email_subject
      ? (lastEmail.email_subject.startsWith('Re: ') ? lastEmail.email_subject : `Re: ${lastEmail.email_subject}`)
      : 'Reactie van SpeedRope Shop'
    const inReplyTo = lastEmail?.email_message_id || undefined

    try {
      emailMessageId = await sendEmail(conv.customer_email, emailSubject, answer_customer_lang, inReplyTo)
      log('info', 'bericht', 'AI-antwoord verstuurd via email', { to: conv.customer_email }, conversation_id)
    } catch (e) {
      console.error('Email send error:', e)
      log('error', 'bericht', 'Email versturen mislukt', { error: String(e), to: conv.customer_email }, conversation_id)
    }
  } else if (conv.customer_phone) {
    try {
      twilioSid = await sendWhatsAppMessage(conv.customer_phone, answer_customer_lang)
      log('info', 'twilio', 'Bericht verstuurd via Twilio', { sid: twilioSid, to: conv.customer_phone }, conversation_id)
    } catch (e) {
      console.error('Twilio send error:', e)
      log('error', 'twilio', 'Versturen via Twilio mislukt', { error: String(e), to: conv.customer_phone }, conversation_id)
    }
  }

  const sent = !!(twilioSid || emailMessageId)

  // Save outbound message
  db.prepare(`
    INSERT INTO messages (conversation_id, direction, content, content_customer_lang, language, twilio_sid, status, channel, email_subject, email_message_id)
    VALUES (?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    conversation_id,
    answer_dutch || answer_customer_lang,
    answer_customer_lang,
    conv.detected_language,
    twilioSid,
    sent ? 'sent' : 'demo',
    sendChannel,
    emailSubject,
    emailMessageId
  )

  db.prepare(`
    UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, last_message = ? WHERE id = ?
  `).run(answer_customer_lang.slice(0, 100), conversation_id)

  // Async: update knowledge base from this interaction (always in Dutch)
  const lastInbound = db.prepare(`
    SELECT content, content_dutch FROM messages WHERE conversation_id = ? AND direction = 'inbound'
    ORDER BY sent_at DESC LIMIT 1
  `).get(conversation_id) as { content: string; content_dutch: string | null } | undefined

  if (lastInbound && answer_dutch) {
    const customerMessageDutch = lastInbound.content_dutch || lastInbound.content
    updateKnowledgeInBackground(customerMessageDutch, answer_dutch, conversation_id).catch(console.error)
  }

  log('info', 'ai', 'AI-antwoord verstuurd', { demo: !sent, channel: sendChannel }, conversation_id)
  return NextResponse.json({ ok: true, twilio_sid: twilioSid })
}

async function updateKnowledgeInBackground(customerMessage: string, agentAnswer: string, conversationId: number) {
  // Pick the most likely topic using Claude (simple heuristic here)
  const lowerMsg = customerMessage.toLowerCase()
  const topicSlug = KNOWLEDGE_TOPICS.find(t => {
    const keywords = t.title.toLowerCase().split(/\s+/)
    return keywords.some(k => k.length > 3 && lowerMsg.includes(k))
  })?.slug || 'troubleshooting'

  const topic = KNOWLEDGE_TOPICS.find(t => t.slug === topicSlug)
  if (!topic) return

  const current = getKnowledgeFile(topicSlug)
  const updated = await updateKnowledgeFromAnswer({
    customerMessage,
    agentAnswer,
    topic: topic.title,
    currentContent: current.content,
    conversationId,
  })

  saveKnowledgeFile(topicSlug, updated)
}
