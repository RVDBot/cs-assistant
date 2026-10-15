import Anthropic from '@anthropic-ai/sdk'
import { getDb } from './db'
import { log } from './logger'

// 'auto' betekent: altijd de nieuwste Opus die de API aanbiedt.
export const AUTO_MODEL = 'auto'
// Alleen gebruikt als de modellenlijst nog nooit is opgehaald én de API onbereikbaar is.
const FALLBACK_MODEL = 'claude-opus-5-5'
const LATEST_TTL_MS = 24 * 60 * 60 * 1000

export type Effort = 'low' | 'medium' | 'high'

export interface ModelOption {
  id: string
  name: string
  createdAt: string
}

function getSetting(key: string): string | undefined {
  return (getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value
}

function setSetting(key: string, value: string) {
  getDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

export function getClient(): Anthropic {
  const apiKey = getSetting('anthropic_api_key') || process.env.ANTHROPIC_API_KEY || ''
  if (!apiKey) throw new Error('Anthropic API key not configured')
  return new Anthropic({ apiKey })
}

export async function listModels(): Promise<ModelOption[]> {
  const models: ModelOption[] = []
  for await (const m of getClient().models.list()) {
    models.push({ id: m.id, name: m.display_name, createdAt: m.created_at })
  }
  return models.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// Nieuwste Opus volgens de Models API, één keer per dag opgehaald. Bij een fout blijft
// het laatst bekende model in gebruik, zodat een storing bij Anthropic niets omgooit.
async function latestOpus(): Promise<string> {
  const cached = getSetting('model_latest_opus')
  const checkedAt = Number(getSetting('model_latest_checked_at') || 0)
  if (cached && Date.now() - checkedAt < LATEST_TTL_MS) return cached

  try {
    const newest = (await listModels()).find(m => m.id.startsWith('claude-opus-'))
    if (newest) {
      if (cached && cached !== newest.id) {
        log('info', 'ai', `Nieuw model in gebruik: ${newest.name}`, { van: cached, naar: newest.id })
      }
      setSetting('model_latest_opus', newest.id)
      setSetting('model_latest_checked_at', String(Date.now()))
      return newest.id
    }
  } catch (e) {
    log('warn', 'ai', 'Modellenlijst ophalen mislukt, vorig model blijft in gebruik', { error: e instanceof Error ? e.message : String(e) })
    // Niet bij elke aanvraag opnieuw proberen
    setSetting('model_latest_checked_at', String(Date.now()))
  }
  return cached || FALLBACK_MODEL
}

export async function resolveModel(): Promise<string> {
  const chosen = getSetting('claude_model') || process.env.CLAUDE_MODEL || AUTO_MODEL
  return chosen === AUTO_MODEL ? latestOpus() : chosen
}

export function cachedLatestOpus(): string | null {
  return getSetting('model_latest_opus') || null
}

// Haiku en modellen ouder dan de 4.6-generatie kennen geen adaptive thinking, effort
// of de nieuwste webtools. Alles daarna wel; nieuwe modellen vallen vanzelf in die groep.
function isLegacy(model: string): boolean {
  return /haiku|claude-3|claude-(opus|sonnet)-4-[0-5](\D|$)|claude-(opus|sonnet)-4-\d{8}/.test(model)
}

export function requestParams(model: string, effort: Effort): Pick<Anthropic.MessageCreateParamsNonStreaming, 'thinking' | 'output_config'> {
  if (isLegacy(model)) return {}
  return { thinking: { type: 'adaptive' }, output_config: { effort } }
}

export function webTools(model: string, domain: string, maxUses = 5): Anthropic.ToolUnion[] {
  const allowed_domains = [domain]
  if (isLegacy(model)) {
    return [
      { type: 'web_search_20250305', name: 'web_search', allowed_domains, max_uses: maxUses },
      { type: 'web_fetch_20250910', name: 'web_fetch', allowed_domains, max_uses: maxUses },
    ]
  }
  return [
    { type: 'web_search_20260209', name: 'web_search', allowed_domains, max_uses: maxUses },
    { type: 'web_fetch_20260209', name: 'web_fetch', allowed_domains, max_uses: maxUses },
  ]
}

export function getWebsiteDomain(): string {
  return getSetting('website_domain') || 'speedropeshop.com'
}
