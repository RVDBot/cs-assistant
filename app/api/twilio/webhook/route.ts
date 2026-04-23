import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { detectLanguage, translateToDutch } from '@/lib/claude'
import { log } from '@/lib/logger'
import { validateTwilioSignature } from '@/lib/security'
import { downloadAndStoreMedia } from '@/lib/media'
import { sendPushToAllDevices } from '@/lib/push'

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

  // Collect and download media attachments from Twilio
  const numMedia = parseInt(params.NumMedia || '0', 10)
  const mediaItems: Array<{ id: string; contentType: string }> = []
  for (let i = 0; i < numMedia; i++) {
    const url = params[`MediaUrl${i}`]
    const contentType = params[`MediaContentType${i}`] || 'application/octet-stream'
    if (url) {
      try {
        const id = await downloadAndStoreMedia(url, contentType)
        mediaItems.push({ id, contentType })
      } catch (e) {
        log('error', 'media', `Media downloaden mislukt: ${url}`, { error: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  // Build display content for media-only messages
  let content = messageBody
  if (!content && mediaItems.length > 0) {
    const labels = mediaItems.map(m => {
      if (m.contentType.startsWith('image/')) return '📷 Afbeelding'
      if (m.contentType.startsWith('video/')) return '🎥 Video'
      if (m.contentType.startsWith('audio/')) return '🎵 Audio'
      return '📎 Bijlage'
    })
    content = labels.join(', ')
  }

  // Require body or media
  if (!content) {
    return new NextResponse(TWIML_EMPTY, { headers: { 'Content-Type': 'text/xml' } })
  }

  // Upsert conversation (unarchive on new message, update last_inbound_at)
  db.prepare(`
    INSERT INTO conversations (customer_phone, updated_at, last_message, unread_count, last_inbound_at)
    VALUES (?, CURRENT_TIMESTAMP, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(customer_phone) DO UPDATE SET
      updated_at     = CURRENT_TIMESTAMP,
      last_message   = excluded.last_message,
      unread_count   = unread_count + 1,
      is_archived    = 0,
      last_inbound_at = CURRENT_TIMESTAMP
  `).run(from, content.slice(0, 100))

  const conv = db.prepare('SELECT id, detected_language, language_manual FROM conversations WHERE customer_phone = ?').get(from) as {
    id: number; detected_language: string; language_manual: number
  }

  let language = conv.detected_language || 'en'
  let dutchContent = content

  // Only translate if there's actual text (not just media labels)
  if (messageBody) {
    try {
      // Skip language detection for short messages (< 4 words) when language is already set,
      // or when language was manually overridden
      const wordCount = messageBody.trim().split(/\s+/).length
      const hasExistingLang = !!conv.detected_language && conv.detected_language !== 'en'
      const skipDetection = conv.language_manual || (hasExistingLang && wordCount < 4)

      if (!skipDetection) {
        language = await detectLanguage(messageBody, conv.id)
        if (language !== conv.detected_language) {
          db.prepare('UPDATE conversations SET detected_language = ? WHERE id = ?').run(language, conv.id)
        }
      }

      dutchContent = await translateToDutch(messageBody, language, conv.id)
    } catch (e) {
      log('error', 'ai', 'Vertaling mislukt', { error: e instanceof Error ? e.message : String(e), from }, conv.id)
    }
    // Prepend media labels to translated content if message has both text and media
    if (mediaItems.length > 0) {
      const labels = mediaItems.map(m => {
        if (m.contentType.startsWith('image/')) return '📷'
        if (m.contentType.startsWith('video/')) return '🎥'
        if (m.contentType.startsWith('audio/')) return '🎵'
        return '📎'
      }).join(' ')
      content = `${labels} ${content}`
      dutchContent = `${labels} ${dutchContent}`
    }
  }

  // Build media URLs JSON for storage
  const mediaJson = mediaItems.length > 0 ? JSON.stringify(mediaItems) : null

  db.prepare(`
    INSERT INTO messages (conversation_id, direction, content, content_dutch, language, twilio_sid, status, media_url)
    VALUES (?, 'inbound', ?, ?, ?, ?, 'received', ?)
  `).run(conv.id, content, dutchContent, language, messageSid, mediaJson)

  try {
    const convRow = db.prepare('SELECT customer_name FROM conversations WHERE id = ?').get(conv.id) as { customer_name: string | null } | undefined
    const title = convRow?.customer_name || from.replace(/^whatsapp:/, '')
    await sendPushToAllDevices({
      title,
      body: dutchContent.slice(0, 140),
      url: `/?conversation=${conv.id}`,
      tag: `conv-${conv.id}`,
    })
  } catch (e) {
    log('error', 'push', 'Push verzenden na inbound WhatsApp mislukt', { error: e instanceof Error ? e.message : String(e) }, conv.id)
  }

  log('info', 'bericht', `Inkomend bericht ontvangen (${language.toUpperCase()})`, { from, sid: messageSid, media: mediaItems.length || undefined }, conv.id)

  return new NextResponse(TWIML_EMPTY, { headers: { 'Content-Type': 'text/xml' } })
}
