import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/twilio'
import { updateKnowledgeFromAnswer } from '@/lib/claude'
import { getKnowledgeFile, saveKnowledgeFile, KNOWLEDGE_TOPICS } from '@/lib/knowledge'

export async function POST(req: NextRequest) {
  const { conversation_id, answer_dutch, answer_customer_lang } = await req.json()

  if (!conversation_id || !answer_customer_lang) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const db = getDb()
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversation_id) as {
    id: number; customer_phone: string; detected_language: string
  } | undefined

  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Send to customer via Twilio
  let twilioSid: string | null = null
  try {
    twilioSid = await sendWhatsAppMessage(conv.customer_phone, answer_customer_lang)
  } catch (e) {
    console.error('Twilio send error:', e)
  }

  // Save outbound message
  db.prepare(`
    INSERT INTO messages (conversation_id, direction, content, content_customer_lang, language, twilio_sid, status)
    VALUES (?, 'outbound', ?, ?, ?, ?, ?)
  `).run(
    conversation_id,
    answer_dutch || answer_customer_lang,
    answer_customer_lang,
    conv.detected_language,
    twilioSid,
    twilioSid ? 'sent' : 'demo'
  )

  db.prepare(`
    UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, last_message = ? WHERE id = ?
  `).run(answer_customer_lang.slice(0, 100), conversation_id)

  // Async: update knowledge base from this interaction
  const lastInbound = db.prepare(`
    SELECT content FROM messages WHERE conversation_id = ? AND direction = 'inbound'
    ORDER BY sent_at DESC LIMIT 1
  `).get(conversation_id) as { content: string } | undefined

  if (lastInbound && answer_dutch) {
    // Determine relevant topic based on a simple keyword approach
    // In a full system you'd use AI to detect the topic
    updateKnowledgeInBackground(lastInbound.content, answer_dutch).catch(console.error)
  }

  return NextResponse.json({ ok: true, twilio_sid: twilioSid })
}

async function updateKnowledgeInBackground(customerMessage: string, agentAnswer: string) {
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
  })

  saveKnowledgeFile(topicSlug, updated)
}
