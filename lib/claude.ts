import Anthropic from '@anthropic-ai/sdk'
import { getDb } from './db'
import { getKnowledgeContext } from './knowledge'

function getClient() {
  const db = getDb()
  const apiKey =
    (db.prepare('SELECT value FROM settings WHERE key = ?').get('anthropic_api_key') as { value: string } | undefined)?.value ||
    process.env.ANTHROPIC_API_KEY ||
    ''
  if (!apiKey) throw new Error('Anthropic API key not configured')
  return new Anthropic({ apiKey })
}

function getModel() {
  const db = getDb()
  return (
    (db.prepare('SELECT value FROM settings WHERE key = ?').get('claude_model') as { value: string } | undefined)?.value ||
    process.env.CLAUDE_MODEL ||
    'claude-opus-4-6'
  )
}

function logTokens(conversationId: number | null | undefined, callType: string, usage: { input_tokens: number; output_tokens: number }) {
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

export async function detectLanguage(text: string, conversationId?: number): Promise<string> {
  const client = getClient()
  const response = await client.messages.create({
    model: getModel(),
    max_tokens: 10,
    messages: [
      {
        role: 'user',
        content: `Detect the language of this text and respond with ONLY the ISO 639-1 two-letter language code (e.g. en, nl, fr, de, es, it, pt, ar, tr, pl, ru). Text: "${text}"`,
      },
    ],
  })
  logTokens(conversationId, 'detect_language', response.usage)
  const code = (response.content[0] as { text: string }).text.trim().toLowerCase().slice(0, 2)
  return code || 'en'
}

export async function translateToDutch(text: string, fromLang: string, conversationId?: number): Promise<string> {
  if (fromLang === 'nl') return text
  const client = getClient()
  const response = await client.messages.create({
    model: getModel(),
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Translate the following text to Dutch. Return ONLY the translation, nothing else.\n\nText: ${text}`,
      },
    ],
  })
  logTokens(conversationId, 'translate_inbound', response.usage)
  return (response.content[0] as { text: string }).text.trim()
}

export async function translateToLanguage(text: string, targetLang: string, conversationId?: number): Promise<string> {
  if (targetLang === 'nl') return text
  const client = getClient()
  const langNames: Record<string, string> = {
    en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian',
    pt: 'Portuguese', ar: 'Arabic', tr: 'Turkish', pl: 'Polish', ru: 'Russian',
    zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  }
  const langName = langNames[targetLang] || targetLang
  const response = await client.messages.create({
    model: getModel(),
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `Translate the following Dutch text to ${langName}. Return ONLY the translation, nothing else.\n\nText: ${text}`,
      },
    ],
  })
  logTokens(conversationId, 'translate_outbound', response.usage)
  return (response.content[0] as { text: string }).text.trim()
}

// Forces Claude to return the answer as structured tool input, instead of relying on
// a "respond with JSON only" prompt instruction (which it doesn't always follow).
const ANSWER_TOOL: Anthropic.Tool = {
  name: 'provide_answer',
  description: 'Provide the drafted customer service answer.',
  input_schema: {
    type: 'object',
    properties: {
      answer_dutch: {
        type: 'string',
        description: 'The answer in Dutch, for the customer service employee to review',
      },
      answer_customer_lang: {
        type: 'string',
        description: "The same answer translated to the customer's language",
      },
    },
    required: ['answer_dutch', 'answer_customer_lang'],
  },
}

function extractAnswer(response: Anthropic.Message): { dutch: string; customerLang: string } {
  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  const input = (toolUse?.input as { answer_dutch?: string; answer_customer_lang?: string } | undefined) || {}
  return { dutch: input.answer_dutch || '', customerLang: input.answer_customer_lang || '' }
}

interface ConversationHistory {
  role: 'user' | 'assistant'
  content: string
}

export interface ImageAttachment {
  data: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
}

export async function generateAnswer(params: {
  customerMessage: string
  customerMessageDutch: string
  customerLanguage: string
  conversationHistory: ConversationHistory[]
  lastOutboundMessage?: string | null
  previousConversations?: string
  conversationId?: number
  preContext?: string
  images?: ImageAttachment[]
}): Promise<{ dutch: string; customerLang: string }> {
  const client = getClient()
  const tone = getToneOfVoice()
  const contextFiles = getContextFiles()
  const contextLinks = getContextLinks()
  const knowledgeContext = await getKnowledgeContext()

  const systemPrompt = `You are a customer service assistant. You help customer service employees craft excellent responses to customers.

${tone ? `## Tone of Voice\n${tone}\n` : ''}

${knowledgeContext ? `## Knowledge Base\n${knowledgeContext}\n` : ''}

${contextFiles ? `## Company Documents\n${contextFiles}\n` : ''}

${contextLinks ? `## Reference Links\n${contextLinks}\n` : ''}

${params.preContext?.trim() ? `## Agent Instructions (MUST follow these)\n${params.preContext.trim()}\n` : ''}

## Your Task
Based on the customer's message and conversation history, generate a helpful, professional response in Dutch (for the customer service employee to review). The customer writes in ${params.customerLanguage}.

**Message priority:** The most recent customer message is the primary question to answer. The most recent reply from the customer service agent is important secondary context. Earlier conversation history is background only.
${params.images?.length ? `\n**Attached image(s):** The customer also sent ${params.images.length} image(s), included with this message. Look at them carefully (e.g. screenshots of errors, photos of products) and use what you see to inform your reply. Never tell the customer you cannot view the image.` : ''}
${params.preContext?.trim() ? '\n**Important:** You have Agent Instructions above — apply them strictly when drafting your response.' : ''}

Use the \`provide_answer\` tool to give your response: the answer in Dutch for the employee, and the same answer translated to the customer's language (${params.customerLanguage}).`

  const lastUserText = [
    params.lastOutboundMessage
      ? `[Most recent CS reply]: ${params.lastOutboundMessage}`
      : null,
    `[Most recent customer message (original)]: ${params.customerMessage}`,
    `[Most recent customer message (Dutch)]: ${params.customerMessageDutch}`,
    'Generate a response.',
  ].filter(Boolean).join('\n')

  const lastUserContent: Anthropic.ContentBlockParam[] = [
    ...(params.images || []).map((img): Anthropic.ImageBlockParam => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.data },
    })),
    { type: 'text', text: lastUserText },
  ]

  const messages: Anthropic.MessageParam[] = [
    ...params.conversationHistory.map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    {
      role: 'user' as const,
      content: lastUserContent,
    },
  ]

  const response = await client.messages.create({
    model: getModel(),
    max_tokens: 2048,
    system: systemPrompt,
    messages,
    tools: [ANSWER_TOOL],
    tool_choice: { type: 'tool', name: 'provide_answer' },
  })

  logTokens(params.conversationId, 'generate', response.usage)
  return extractAnswer(response)
}

export async function improveAnswer(params: {
  currentAnswer: string
  instruction: string
  customerMessage: string
  customerLanguage: string
  conversationId?: number
  fetchedPages?: { url: string; content: string }[]
}): Promise<{ dutch: string; customerLang: string }> {
  const client = getClient()
  const tone = getToneOfVoice()
  const knowledgeContext = await getKnowledgeContext()

  const fetchedContext = params.fetchedPages?.length
    ? params.fetchedPages.map(p => `### Opgehaalde pagina: ${p.url}\n${p.content}`).join('\n\n')
    : ''

  const systemPrompt = `You are a customer service assistant helping to improve draft responses.

${tone ? `## Tone of Voice\n${tone}\n` : ''}

${knowledgeContext ? `## Knowledge Base\n${knowledgeContext}\n` : ''}

${fetchedContext ? `## Opgehaalde webpagina's (gebruik deze inhoud om het antwoord te verbeteren)\n${fetchedContext}\n` : ''}

The customer service employee gives you a meta-instruction describing HOW to change the draft response. Your job is to rewrite the draft according to that instruction using any provided context above.

Rules:
- The instruction is a directive TO YOU — never copy it into the answer
- If the instruction references a URL, that page's content has already been fetched and is shown above — use the information from it, do NOT tell the customer to visit the URL or look something up
- Never tell the customer to visit a URL unless it is genuinely useful for them to do so (e.g. a tracking link)
- Never mention that you looked something up or fetched a page

Use the \`provide_answer\` tool to give your response: the rewritten answer in Dutch, and the same answer translated to the customer's language (${params.customerLanguage}).`

  const response = await client.messages.create({
    model: getModel(),
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Customer message: ${params.customerMessage}\n\nCurrent draft (Dutch): ${params.currentAnswer}\n\nInstruction for you (do not copy into the answer): ${params.instruction}`,
      },
    ],
    tools: [ANSWER_TOOL],
    tool_choice: { type: 'tool', name: 'provide_answer' },
  })

  logTokens(params.conversationId, 'improve', response.usage)
  return extractAnswer(response)
}

export async function updateKnowledgeFromAnswer(params: {
  customerMessage: string
  agentAnswer: string
  topic: string
  currentContent: string
  conversationId?: number
}): Promise<string> {
  const client = getClient()

  const response = await client.messages.create({
    model: getModel(),
    max_tokens: 4096,
    system: `Je beheert een kennisbank voor klantenservice, volledig geschreven in het Nederlands en in Markdown-formaat. Je krijgt een bestaand kennisbestand en een nieuwe klantinteractie (al vertaald naar het Nederlands). Werk het kennisbestand bij met eventuele nieuwe informatie, correcties of verbeteringen. Voeg alleen echt nieuwe informatie toe; herhaal geen bestaande inhoud. Schrijf altijd in correct Nederlands, gebruik Markdown-opmaak (koppen, opsommingen, vetgedrukte tekst waar passend). Geef ALLEEN de bijgewerkte bestandsinhoud terug, geen uitleg of opmerkingen.`,
    messages: [
      {
        role: 'user',
        content: `Topic: ${params.topic}

Current knowledge file content:
${params.currentContent || '(empty)'}

New customer interaction:
Customer: ${params.customerMessage}
Agent: ${params.agentAnswer}

Return the updated knowledge file content in Markdown. Return ONLY the markdown content, no explanations.`,
      },
    ],
  })

  logTokens(params.conversationId, 'knowledge_update', response.usage)
  return (response.content[0] as { text: string }).text.trim()
}
