import Anthropic from '@anthropic-ai/sdk'
import { getDb } from './db'
import { getKnowledgeContext } from './knowledge'
import { getClient, resolveModel, requestParams, webTools, getWebsiteDomain, type Effort } from './models'
import { formatNow, formatTimestamp, dayPart, shouldGreet, type DayPart } from './conversation-context'

export function logTokens(conversationId: number | null | undefined, callType: string, usage: { input_tokens: number; output_tokens: number }) {
  try {
    const db = getDb()
    db.prepare(`
      INSERT INTO token_usage (conversation_id, call_type, input_tokens, output_tokens)
      VALUES (?, ?, ?, ?)
    `).run(conversationId ?? null, callType, usage.input_tokens, usage.output_tokens)
  } catch (e) {
    console.error('Failed to log token usage:', e)
  }
}

function getToneOfVoice(): string {
  const db = getDb()
  const row = db.prepare('SELECT prompt FROM tone_of_voice WHERE id = 1').get() as { prompt: string } | undefined
  return row?.prompt || ''
}

function getContextFiles(): string {
  const db = getDb()
  const files = db.prepare('SELECT name, content FROM context_files').all() as { name: string; content: string }[]
  if (!files.length) return ''
  return files.map(f => `### File: ${f.name}\n${f.content}`).join('\n\n')
}

function getContextLinks(): string {
  const db = getDb()
  const links = db.prepare('SELECT url, title, content FROM context_links WHERE content IS NOT NULL').all() as {
    url: string; title: string | null; content: string | null
  }[]
  if (!links.length) return ''
  return links.map(l => `### Link: ${l.title || l.url}\n${l.content}`).join('\n\n')
}

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim()
}

function assertNotRefused(response: Anthropic.Message) {
  if (response.stop_reason === 'refusal') {
    throw new Error('Claude heeft dit verzoek geweigerd')
  }
}

// Korte, losse taken (taal herkennen, vertalen) op lage effort.
async function simpleText(prompt: string, maxTokens: number, callType: string, conversationId?: number): Promise<string> {
  const model = await resolveModel()
  const response = await getClient().messages.create({
    model,
    max_tokens: maxTokens,
    ...requestParams(model, 'low'),
    messages: [{ role: 'user', content: prompt }],
  })
  logTokens(conversationId, callType, response.usage)
  assertNotRefused(response)
  return textOf(response)
}

export async function detectLanguage(text: string, conversationId?: number): Promise<string> {
  const reply = await simpleText(
    `Detect the language of this text and respond with ONLY the ISO 639-1 two-letter language code (e.g. en, nl, fr, de, es, it, pt, ar, tr, pl, ru). Text: "${text}"`,
    2000,
    'detect_language',
    conversationId,
  )
  const code = reply.toLowerCase().match(/\b[a-z]{2}\b/)?.[0]
  return code || 'en'
}

export async function translateToDutch(text: string, fromLang: string, conversationId?: number): Promise<string> {
  if (fromLang === 'nl') return text
  return simpleText(
    `Translate the following text to Dutch. Return ONLY the translation, nothing else.\n\nText: ${text}`,
    8000,
    'translate_inbound',
    conversationId,
  )
}

// Het antwoord komt terug als invoer van deze tool. `strict` garandeert dat de velden
// kloppen; de aanroep zelf wordt gevraagd in de prompt (tool_choice 'auto'), omdat
// nieuwere modellen een geforceerde tool-keuze weigeren.
const ANSWER_TOOL: Anthropic.Tool = {
  name: 'provide_answer',
  description: 'Deliver the final drafted customer service reply. Call this exactly once, after any website lookups.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      answer_dutch: {
        type: 'string',
        description: 'The reply in Dutch, for the customer service employee to review',
      },
      answer_customer_lang: {
        type: 'string',
        description: "The same reply in the customer's language",
      },
    },
    required: ['answer_dutch', 'answer_customer_lang'],
    additionalProperties: false,
  },
}

function extractAnswer(response: Anthropic.Message): { dutch: string; customerLang: string } | null {
  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === ANSWER_TOOL.name,
  )
  if (!toolUse) return null
  const input = toolUse.input as { answer_dutch?: string; answer_customer_lang?: string }
  if (!input.answer_dutch && !input.answer_customer_lang) return null
  return { dutch: input.answer_dutch || '', customerLang: input.answer_customer_lang || input.answer_dutch || '' }
}

// Draait tot Claude provide_answer aanroept. Tussendoor kan Claude op de website zoeken;
// die tools draaien bij Anthropic, dus hier hoeft alleen pause_turn hervat te worden.
async function runAnswer(params: {
  system: string
  styleExamples?: string
  userContent: Anthropic.ContentBlockParam[]
  effort: Effort
  callType: string
  conversationId?: number
}): Promise<{ dutch: string; customerLang: string }> {
  const model = await resolveModel()
  const client = getClient()
  const tools: Anthropic.ToolUnion[] = [ANSWER_TOOL, ...webTools(model, getWebsiteDomain())]
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: params.userContent }]

  for (let round = 0; round < 6; round++) {
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      ...requestParams(model, params.effort),
      system: [
        { type: 'text', text: params.system, cache_control: { type: 'ephemeral' } },
        // Na het cachepunt: verandert bij elk verstuurd antwoord
        ...(params.styleExamples ? [{ type: 'text' as const, text: params.styleExamples }] : []),
      ],
      messages,
      tools,
      tool_choice: { type: 'auto' },
    })
    logTokens(params.conversationId, params.callType, response.usage)
    assertNotRefused(response)

    const answer = extractAnswer(response)
    if (answer) return answer

    messages.push({ role: 'assistant', content: response.content })
    if (response.stop_reason !== 'pause_turn') {
      messages.push({ role: 'user', content: 'Lever het antwoord nu aan via de provide_answer tool.' })
    }
  }
  throw new Error('Claude gaf geen antwoord terug')
}

export interface TranscriptMessage {
  direction: 'inbound' | 'outbound'
  content: string
  contentDutch: string | null
  sentAt: Date
}

export interface ImageAttachment {
  data: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
}

const GREETING_BY_DAYPART: Record<DayPart, string> = {
  nacht: 'Hallo',
  ochtend: 'Goedemorgen',
  middag: 'Goedemiddag',
  avond: 'Goedenavond',
}

function buildSystemPrompt(): string {
  const tone = getToneOfVoice()
  const knowledge = getKnowledgeContext()
  const files = getContextFiles()
  const links = getContextLinks()
  const domain = getWebsiteDomain()

  return `You draft replies for the customer service team of ${domain}, a web shop. A team member reviews every draft before it is sent.

${tone ? `## Tone of voice\n${tone}\n` : ''}
${knowledge ? `## Knowledge base\n${knowledge}\n` : ''}
${files ? `## Company documents\n${files}\n` : ''}
${links ? `## Reference pages\n${links}\n` : ''}
## Looking things up on ${domain}
You can search and open pages on ${domain} with web_search and web_fetch. Product details, sizes, prices, stock, shipping, returns, FAQ and help articles live there. When the customer asks about any of that, look it up before answering instead of relying on memory, and base the facts in your reply on what you find. If the knowledge base and the website disagree, the knowledge base wins: it holds corrections from the team. Never invent facts, prices, delivery times or policies; if you cannot find something, say the team will check and get back to the customer. Include a link to a specific page only when it genuinely helps the customer (for example a product page or a help article), never as a substitute for answering.

## How these conversations work
Most conversations are WhatsApp chats: one ongoing thread, not a series of separate letters. Reply the way an experienced colleague types in a chat: direct, natural, and short. Answer what was asked, do not repeat what was already said earlier in the thread, and do not sign off with a name or closing formula. Whether to open with a greeting is decided for you per request; follow that instruction exactly.

## Output
Deliver the reply by calling provide_answer once: answer_dutch is the reply in Dutch for the team member, answer_customer_lang is the same reply in the customer's language (identical to the Dutch text when the customer writes Dutch).`
}

// Recente antwoorden van het team als stijlvoorbeeld. Alleen inhoudelijke berichten
// via hetzelfde kanaal; we tonen wat er in het Nederlands is opgesteld.
function getStyleExamples(channel: 'whatsapp' | 'email', excludeConversationId?: number): string {
  const rows = getDb().prepare(`
    SELECT content FROM messages
    WHERE direction = 'outbound' AND status != 'demo' AND channel = ? AND template_id IS NULL
      AND LENGTH(content) BETWEEN 40 AND 1200 AND conversation_id != ?
      AND sent_at > datetime('now', '-60 days')
    ORDER BY sent_at DESC LIMIT 8
  `).all(channel, excludeConversationId ?? -1) as { content: string }[]
  if (rows.length < 3) return ''
  return `## Recent replies the team sent (style reference only)
These show how the team actually writes: length, warmth, word choice, how they open and close. Match that style. Do not copy their content; facts in them may not apply to this customer.

${rows.map((r, i) => `<example ${i + 1}>\n${r.content}\n</example ${i + 1}>`).join('\n\n')}`
}

function transcriptLines(transcript: TranscriptMessage[]): string {
  return transcript
    .map(m => {
      const when = formatTimestamp(m.sentAt)
      if (m.direction === 'outbound') return `[${when}] Wij: ${m.content}`
      const dutch = m.contentDutch && m.contentDutch !== m.content ? `\n    (NL: ${m.contentDutch})` : ''
      return `[${when}] Klant: ${m.content}${dutch}`
    })
    .join('\n')
}

export async function generateAnswer(params: {
  transcript: TranscriptMessage[]
  customerLanguage: string
  customerName: string | null
  channel: 'whatsapp' | 'email'
  conversationId?: number
  preContext?: string
  images?: ImageAttachment[]
}): Promise<{ dutch: string; customerLang: string }> {
  const now = new Date()
  const greet = shouldGreet(params.transcript, now, params.channel)
  const part = dayPart(now)
  const firstName = params.customerName?.trim().split(/\s+/)[0]

  const greetingRule = params.channel === 'email'
    ? `This is an email. Open with a short greeting${firstName ? ` using the name ${firstName}` : ''} and end with a brief, friendly closing, as is normal for email.`
    : greet
      ? `Open with a short greeting that fits the time of day (in Dutch that would be "${GREETING_BY_DAYPART[part]}")${firstName ? `, you may use the name ${firstName}` : ''}. Do not thank them for their message.`
      : 'Do NOT open with a greeting, and do not thank them for their message or for waiting. The chat is ongoing: reply directly to what they said.'

  const pre = params.preContext?.trim()
  const text = `Current time: ${formatNow(now)} (${part}), Dutch time.
Channel: ${params.channel === 'email' ? 'email' : 'WhatsApp'}. Customer language: ${params.customerLanguage}.${params.customerName ? ` Customer name: ${params.customerName}.` : ''}

## Conversation so far (oldest first)
${transcriptLines(params.transcript)}

## Instructions for this reply
- Reply to the customer's most recent message(s); earlier messages are context.
- ${greetingRule}
${params.images?.length ? `- The customer sent ${params.images.length} image(s), attached above. Look at them and use what you see. Never say you cannot view images.\n` : ''}${pre ? `- Instructions from the team member, follow these strictly:\n${pre}\n` : ''}`

  const userContent: Anthropic.ContentBlockParam[] = [
    ...(params.images || []).map((img): Anthropic.ImageBlockParam => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.data },
    })),
    { type: 'text', text },
  ]

  return runAnswer({
    system: buildSystemPrompt(),
    styleExamples: getStyleExamples(params.channel, params.conversationId),
    userContent,
    effort: 'high',
    callType: 'generate',
    conversationId: params.conversationId,
  })
}

export async function improveAnswer(params: {
  currentAnswer: string
  instruction: string
  customerMessage: string
  customerLanguage: string
  conversationId?: number
  fetchedPages?: { url: string; content: string }[]
}): Promise<{ dutch: string; customerLang: string }> {
  const fetched = params.fetchedPages?.length
    ? `\n## Pages the team member referred to\n${params.fetchedPages.map(p => `### ${p.url}\n${p.content}`).join('\n\n')}\n`
    : ''

  const text = `The team member wants the draft reply changed.

Customer's latest message: ${params.customerMessage}

Current draft (Dutch):
${params.currentAnswer}
${fetched}
Instruction from the team member (a directive to you, never copy it into the reply):
${params.instruction}

Rewrite the draft according to the instruction. Keep everything the instruction does not ask to change, including whether the draft opens with a greeting. If the instruction needs facts you do not have, look them up on the website. Never tell the customer to look something up themselves, and never mention that you looked something up.`

  return runAnswer({
    system: buildSystemPrompt(),
    userContent: [{ type: 'text', text }],
    effort: 'medium',
    callType: 'improve',
    conversationId: params.conversationId,
  })
}
