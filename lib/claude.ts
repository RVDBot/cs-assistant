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

export async function detectLanguage(text: string): Promise<string> {
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
  const code = (response.content[0] as { text: string }).text.trim().toLowerCase().slice(0, 2)
  return code || 'en'
}

export async function translateToDutch(text: string, fromLang: string): Promise<string> {
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
  return (response.content[0] as { text: string }).text.trim()
}

export async function translateToLanguage(text: string, targetLang: string): Promise<string> {
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
  return (response.content[0] as { text: string }).text.trim()
}

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
}

interface ConversationHistory {
  role: 'user' | 'assistant'
  content: string
}

export async function generateAnswer(params: {
  customerMessage: string
  customerMessageDutch: string
  customerLanguage: string
  conversationHistory: ConversationHistory[]
  previousConversations?: string
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

## Your Task
Based on the customer's message and conversation history, generate a helpful, professional response in Dutch (for the customer service employee to review). The customer writes in ${params.customerLanguage}.

Respond with a JSON object in this exact format:
{
  "answer_dutch": "The answer in Dutch for the customer service employee",
  "answer_customer_lang": "The same answer translated to the customer's language (${params.customerLanguage})"
}

Important: Only return the JSON object, nothing else.`

  const messages: Anthropic.MessageParam[] = [
    ...params.conversationHistory.map(h => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    {
      role: 'user' as const,
      content: `Customer message (original): ${params.customerMessage}\nCustomer message (Dutch): ${params.customerMessageDutch}\n\nGenerate a response.`,
    },
  ]

  const response = await client.messages.create({
    model: getModel(),
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  })

  const raw = (response.content[0] as { text: string }).text.trim()
  try {
    const parsed = JSON.parse(stripCodeFences(raw))
    return {
      dutch: parsed.answer_dutch || '',
      customerLang: parsed.answer_customer_lang || '',
    }
  } catch {
    // Fallback if JSON parsing fails
    return { dutch: raw, customerLang: raw }
  }
}

export async function improveAnswer(params: {
  currentAnswer: string
  instruction: string
  customerMessage: string
  customerLanguage: string
}): Promise<{ dutch: string; customerLang: string }> {
  const client = getClient()
  const tone = getToneOfVoice()
  const knowledgeContext = await getKnowledgeContext()

  const systemPrompt = `You are a customer service assistant helping to improve draft responses.

${tone ? `## Tone of Voice\n${tone}\n` : ''}

${knowledgeContext ? `## Knowledge Base\n${knowledgeContext}\n` : ''}

The customer service employee gives you a meta-instruction describing HOW to change the draft response (e.g. "make it friendlier", "add the return address", "keep it shorter"). Your job is to rewrite the draft according to that instruction. Never include the instruction text literally in the output — it is a directive to you, not content for the answer.

Respond with a JSON object in this exact format:
{
  "answer_dutch": "The rewritten answer in Dutch",
  "answer_customer_lang": "The rewritten answer translated to the customer's language (${params.customerLanguage})"
}

Only return the JSON object, nothing else.`

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
  })

  const raw = (response.content[0] as { text: string }).text.trim()
  try {
    const parsed = JSON.parse(stripCodeFences(raw))
    return {
      dutch: parsed.answer_dutch || '',
      customerLang: parsed.answer_customer_lang || '',
    }
  } catch {
    return { dutch: raw, customerLang: raw }
  }
}

export async function updateKnowledgeFromAnswer(params: {
  customerMessage: string
  agentAnswer: string
  topic: string
  currentContent: string
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

  return (response.content[0] as { text: string }).text.trim()
}
