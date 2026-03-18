import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { sendWhatsAppTemplate } from '@/lib/twilio'
import { log } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { conversation_id, template_id, variables } = body

  if (!conversation_id || !template_id) {
    return NextResponse.json({ error: 'conversation_id en template_id vereist' }, { status: 400 })
  }

  const db = getDb()

  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversation_id) as {
    id: number; customer_phone: string | null; detected_language: string
  } | undefined
  if (!conv) return NextResponse.json({ error: 'Conversatie niet gevonden' }, { status: 404 })
  if (!conv.customer_phone) return NextResponse.json({ error: 'Geen WhatsApp nummer' }, { status: 400 })

  const template = db.prepare('SELECT * FROM wa_templates WHERE id = ?').get(template_id) as {
    id: number; name: string; variables: string
  } | undefined
  if (!template) return NextResponse.json({ error: 'Template niet gevonden' }, { status: 404 })

  // Find best variant: exact language match → 'en' fallback → first available
  const allVariants = db.prepare(
    'SELECT * FROM wa_template_variants WHERE template_id = ?'
  ).all(template_id) as { id: number; language: string; content_sid: string; preview: string | null }[]

  if (allVariants.length === 0) {
    return NextResponse.json({ error: 'Template heeft geen taalvarianten' }, { status: 400 })
  }

  const variant =
    allVariants.find(v => v.language === conv.detected_language) ||
    allVariants.find(v => v.language === 'en') ||
    allVariants[0]

  const isFallback = variant.language !== conv.detected_language

  // Build content variables map
  const contentVariables: Record<string, string> = {}
  const templateVars: { key: string; label: string }[] = JSON.parse(template.variables)
  for (const v of templateVars) {
    contentVariables[v.key] = variables?.[v.key] || ''
  }

  // Build preview with variables filled in
  let previewText = variant.preview || template.name
  for (const [key, value] of Object.entries(contentVariables)) {
    previewText = previewText.replace(`{{${key}}}`, value)
  }

  let twilioSid: string | null = null
  try {
    twilioSid = await sendWhatsAppTemplate(conv.customer_phone, variant.content_sid, contentVariables)
    log('info', 'twilio', `Template "${template.name}" verstuurd (${variant.language})`, {
      sid: twilioSid,
      to: conv.customer_phone,
      content_sid: variant.content_sid,
      fallback: isFallback || undefined,
    }, conversation_id)
  } catch (e) {
    log('error', 'twilio', `Template "${template.name}" versturen mislukt`, {
      error: e instanceof Error ? e.message : String(e),
    }, conversation_id)
    return NextResponse.json({ error: 'Template versturen mislukt: ' + (e instanceof Error ? e.message : String(e)) }, { status: 500 })
  }

  const result = db.prepare(`
    INSERT INTO messages (conversation_id, direction, content, content_customer_lang, language, twilio_sid, status, channel, template_id)
    VALUES (?, 'outbound', ?, ?, ?, ?, 'sent', 'whatsapp', ?)
  `).run(conversation_id, previewText, previewText, variant.language, twilioSid, template_id)

  db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, last_message = ? WHERE id = ?')
    .run(previewText.slice(0, 100), conversation_id)

  return NextResponse.json({
    id: result.lastInsertRowid,
    twilio_sid: twilioSid,
    variant_language: variant.language,
    is_fallback: isFallback,
  })
}
