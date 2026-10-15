import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { generateAnswer, type ImageAttachment } from '@/lib/claude'
import { readMediaFile } from '@/lib/media'
import { parseDbTime } from '@/lib/conversation-context'
import { log } from '@/lib/logger'
import { recordDraft } from '@/lib/learning'

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export async function POST(req: NextRequest) {
  const { conversation_id, pre_context } = await req.json()

  if (!conversation_id) {
    return NextResponse.json({ error: 'Missing conversation_id' }, { status: 400 })
  }

  const db = getDb()
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversation_id) as {
    id: number; customer_phone: string | null; customer_name: string | null; detected_language: string
  } | undefined

  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const messages = db.prepare(`
    SELECT direction, content, content_dutch, content_customer_lang, media_url, sent_at, channel FROM messages
    WHERE conversation_id = ?
    ORDER BY sent_at ASC
  `).all(conversation_id) as {
    direction: 'inbound' | 'outbound'; content: string; content_dutch: string | null; content_customer_lang: string | null
    media_url: string | null; sent_at: string; channel: string
  }[]

  const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound')
  if (!lastInbound) {
    return NextResponse.json({ error: 'No customer message found' }, { status: 400 })
  }

  // Load any images attached to the last inbound message so Claude can see them
  const images: ImageAttachment[] = []
  if (lastInbound.media_url) {
    try {
      const items = JSON.parse(lastInbound.media_url) as Array<{ id: string; contentType: string }>
      for (const item of items) {
        if (!SUPPORTED_IMAGE_TYPES.includes(item.contentType)) continue
        const buf = readMediaFile(item.id)
        if (buf) images.push({ data: buf.toString('base64'), mediaType: item.contentType as ImageAttachment['mediaType'] })
      }
    } catch {}
  }

  // De laatste 30 berichten met tijdstempel. Van onze berichten telt wat de klant
  // daadwerkelijk zag (de vertaalde versie).
  const transcript = messages.slice(-30).map(m => ({
    direction: m.direction,
    content: m.direction === 'outbound' ? (m.content_customer_lang || m.content) : m.content,
    contentDutch: m.content_dutch,
    sentAt: parseDbTime(m.sent_at),
  }))

  try {
    const result = await generateAnswer({
      transcript,
      customerLanguage: conv.detected_language,
      customerName: conv.customer_name,
      channel: lastInbound.channel === 'email' ? 'email' : 'whatsapp',
      conversationId: conv.id,
      preContext: pre_context || '',
      images,
    })
    recordDraft(conv.id, result.dutch)
    return NextResponse.json(result)
  } catch (e) {
    log('error', 'ai', 'Antwoord genereren mislukt', { error: e instanceof Error ? e.message : String(e) }, conv.id)
    return NextResponse.json({ error: 'Er ging iets mis bij het genereren van een antwoord.' }, { status: 500 })
  }
}
