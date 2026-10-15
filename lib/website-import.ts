import Anthropic from '@anthropic-ai/sdk'
import { getDb } from './db'
import { logTokens } from './claude'
import { getClient, resolveModel, requestParams, webTools, getWebsiteDomain } from './models'
import { KNOWLEDGE_TOPICS, addFact } from './knowledge'
import { log } from './logger'

// Eenmalige (herhaalbare) analyse van de website: een concept-tone-of-voice dat het
// team zelf overneemt, en feiten per onderwerp als startpunt voor de kennisbank.

export interface ImportStatus {
  state: 'idle' | 'running' | 'done' | 'error'
  startedAt?: string
  finishedAt?: string
  message?: string
  factCount?: number
}

const STATUS_KEY = 'website_import_status'
const DRAFT_KEY = 'tone_of_voice_draft'
// Een taak die langer loopt is bij een herstart van de container afgebroken
const STALE_AFTER_MS = 30 * 60 * 1000

function setSetting(key: string, value: string) {
  getDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

function getSetting(key: string): string | undefined {
  return (getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value
}

export function getImportStatus(): ImportStatus {
  const raw = getSetting(STATUS_KEY)
  if (!raw) return { state: 'idle' }
  const status = JSON.parse(raw) as ImportStatus
  if (status.state === 'running' && status.startedAt && Date.now() - Date.parse(status.startedAt) > STALE_AFTER_MS) {
    return { ...status, state: 'error', message: 'Analyse onderbroken (server herstart?). Probeer het opnieuw.' }
  }
  return status
}

function setStatus(status: ImportStatus) {
  setSetting(STATUS_KEY, JSON.stringify(status))
}

export function getToneDraft(): string {
  return getSetting(DRAFT_KEY) || ''
}

export function clearToneDraft() {
  getDb().prepare('DELETE FROM settings WHERE key = ?').run(DRAFT_KEY)
}

const SAVE_TOOL: Anthropic.Tool = {
  name: 'save_website_analysis',
  description: 'Save the finished analysis of the website. Call this once, after you have read enough of the site.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      tone_of_voice: {
        type: 'string',
        description: 'Tone-of-voice instructions in Dutch for customer service replies, written as directives',
      },
      facts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string', enum: KNOWLEDGE_TOPICS.map(t => t.slug) },
            fact: { type: 'string', description: 'One self-contained fact in Dutch' },
          },
          required: ['topic', 'fact'],
          additionalProperties: false,
        },
      },
    },
    required: ['tone_of_voice', 'facts'],
    additionalProperties: false,
  },
}

interface Analysis {
  tone_of_voice: string
  facts: { topic: string; fact: string }[]
}

// Start de analyse op de achtergrond. Geeft false als er al een loopt.
export function startWebsiteImport(): boolean {
  if (getImportStatus().state === 'running') return false
  setStatus({ state: 'running', startedAt: new Date().toISOString() })
  runImport().catch(() => {})
  return true
}

async function runImport() {
  const domain = getWebsiteDomain()
  try {
    const analysis = await analyse(domain)
    const valid = analysis.facts.filter(f => KNOWLEDGE_TOPICS.some(t => t.slug === f.topic) && f.fact.trim())

    // Een nieuwe analyse vervangt de vorige websitefeiten; wat het team leerde blijft staan
    const db = getDb()
    db.transaction(() => {
      db.prepare("DELETE FROM knowledge_facts WHERE source = 'website'").run()
      for (const f of valid) addFact(f.topic, f.fact, 'website', null)
    })()
    if (analysis.tone_of_voice.trim()) setSetting(DRAFT_KEY, analysis.tone_of_voice.trim())

    setStatus({ state: 'done', finishedAt: new Date().toISOString(), factCount: valid.length })
    log('info', 'ai', `Website geanalyseerd: ${valid.length} feiten en een concept-tone-of-voice`, { domain })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    setStatus({ state: 'error', finishedAt: new Date().toISOString(), message })
    log('error', 'ai', 'Website analyseren mislukt', { domain, error: message })
  }
}

async function analyse(domain: string): Promise<Analysis> {
  const model = await resolveModel()
  const client = getClient()

  const system = `You are setting up the customer service assistant for the web shop ${domain}. Study the website with web_search and web_fetch (restricted to ${domain}) and produce two things.

1. Tone of voice. Read pages where the shop speaks to customers in its own voice: home page, about us, FAQ, help articles, product descriptions, shipping and returns pages. Describe how customer service replies should sound so they match: formal or informal address (je/jij versus u), warmth, enthusiasm, sentence length, typical word choices, use of emoji or exclamation marks, how the shop refers to itself. Write it in Dutch as concrete instructions to a writer ("Spreek klanten aan met je", not "The site uses je"), roughly 8 to 15 bullet points. Include two or three short example phrases in the shop's style.

2. Facts for the knowledge base. Collect facts customers ask about: shipping costs, delivery times per country, carriers, return period and procedure, warranty, payment methods, how to choose a size or length, product care, popular product differences, contact details and opening hours. Each fact in Dutch, standalone, specific (numbers, conditions). Only facts you actually read on the site; never guess. Put each fact under the best topic.

Work efficiently: search for the key pages first (FAQ, shipping, returns, about, contact), then open them. When done, call save_website_analysis once.

Topics:
${KNOWLEDGE_TOPICS.map(t => `- ${t.slug}: ${t.title}`).join('\n')}`

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `Analyseer ${domain} en sla het resultaat op met save_website_analysis.` },
  ]
  const tools: Anthropic.ToolUnion[] = [SAVE_TOOL, ...webTools(model, domain, 25)]

  for (let round = 0; round < 12; round++) {
    // Streaming: een lange analyse met veel tokens past niet binnen een gewone HTTP-aanvraag
    const response = await client.messages.stream({
      model,
      max_tokens: 32000,
      ...requestParams(model, 'high'),
      system,
      messages,
      tools,
      tool_choice: { type: 'auto' },
    }).finalMessage()
    logTokens(null, 'website_import', response.usage)
    if (response.stop_reason === 'refusal') throw new Error('Claude heeft dit verzoek geweigerd')

    const call = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === SAVE_TOOL.name,
    )
    if (call) return call.input as Analysis

    messages.push({ role: 'assistant', content: response.content })
    if (response.stop_reason !== 'pause_turn') {
      messages.push({ role: 'user', content: 'Sla het resultaat nu op met save_website_analysis.' })
    }
  }
  throw new Error('Analyse niet afgerond')
}
