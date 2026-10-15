import Anthropic from '@anthropic-ai/sdk'
import { getDb } from './db'
import { logTokens } from './claude'
import { getClient, resolveModel, requestParams, getWebsiteDomain } from './models'
import { KNOWLEDGE_TOPICS, getFacts, getKnowledgeFile, addFact, updateFact, type FactSource } from './knowledge'
import { log } from './logger'

// ---- AI-concepten per gesprek ----

export function recordDraft(conversationId: number, draftDutch: string) {
  getDb().prepare(`
    INSERT INTO ai_drafts (conversation_id, draft_dutch, instructions, created_at)
    VALUES (?, ?, '[]', CURRENT_TIMESTAMP)
    ON CONFLICT(conversation_id) DO UPDATE SET
      draft_dutch = excluded.draft_dutch, instructions = '[]', created_at = CURRENT_TIMESTAMP
  `).run(conversationId, draftDutch)
}

// Een verbetering zonder bekend concept (bv. na een herstart) begint een nieuw concept
// bij de versie die verbeterd werd.
export function recordInstruction(conversationId: number, instruction: string, draftBefore: string) {
  const db = getDb()
  const row = db.prepare('SELECT instructions FROM ai_drafts WHERE conversation_id = ?').get(conversationId) as { instructions: string } | undefined
  if (!row) recordDraft(conversationId, draftBefore)
  const list: string[] = row ? JSON.parse(row.instructions) : []
  list.push(instruction)
  db.prepare('UPDATE ai_drafts SET instructions = ? WHERE conversation_id = ?').run(JSON.stringify(list), conversationId)
}

export function takeDraft(conversationId: number): { draft: string; instructions: string[] } | null {
  const db = getDb()
  const row = db.prepare('SELECT draft_dutch, instructions FROM ai_drafts WHERE conversation_id = ?').get(conversationId) as
    { draft_dutch: string; instructions: string } | undefined
  if (!row) return null
  db.prepare('DELETE FROM ai_drafts WHERE conversation_id = ?').run(conversationId)
  return { draft: row.draft_dutch, instructions: JSON.parse(row.instructions) }
}

// ---- Leren ----

const TOPIC_SLUGS = KNOWLEDGE_TOPICS.map(t => t.slug)

const RECORD_FACTS_TOOL: Anthropic.Tool = {
  name: 'record_facts',
  description: 'Record what the knowledge base should learn from this interaction. Pass an empty list when there is nothing worth keeping.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      facts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string', enum: TOPIC_SLUGS },
            fact: { type: 'string', description: 'One self-contained fact in Dutch, one or two sentences' },
            replaces_id: { type: 'integer', description: 'Id of the existing fact this one corrects or supersedes, or 0 for a new fact' },
          },
          required: ['topic', 'fact', 'replaces_id'],
          additionalProperties: false,
        },
      },
    },
    required: ['facts'],
    additionalProperties: false,
  },
}

interface LearnedFact {
  topic: string
  fact: string
  replaces_id: number
}

export interface Interaction {
  conversationId: number
  customerMessage: string
  finalAnswer: string
  aiDraft?: string | null
  instructions?: string[]
  origin: 'ai' | 'manual'
}

// Draait op de achtergrond na versturen. Fouten komen in het logboek en worden niet
// doorgegeven: versturen naar de klant is dan al gelukt.
export async function learnFromInteraction(i: Interaction): Promise<void> {
  try {
    const facts = await extractFacts(i)
    const source: FactSource = i.origin
    let added = 0
    let replaced = 0
    for (const f of facts) {
      if (!TOPIC_SLUGS.includes(f.topic) || !f.fact.trim()) continue
      if (f.replaces_id > 0 && updateFact(f.replaces_id, f.fact, f.topic)) {
        replaced++
      } else {
        addFact(f.topic, f.fact, source, i.conversationId)
        added++
      }
    }
    if (added || replaced) {
      log('info', 'ai', `Kennisbank bijgewerkt: ${added} nieuw, ${replaced} aangepast`, { facts: facts.map(f => f.fact) }, i.conversationId)
    }
  } catch (e) {
    log('error', 'ai', 'Kennisbank bijwerken mislukt', { error: e instanceof Error ? e.message : String(e) }, i.conversationId)
  }
}

async function extractFacts(i: Interaction): Promise<LearnedFact[]> {
  const existing = getFacts()
  const topicFiles = KNOWLEDGE_TOPICS
    .map(t => ({ t, content: getKnowledgeFile(t.slug).content.trim() }))
    .filter(x => x.content)
    .map(x => `### ${x.t.title} (${x.t.slug})\n${x.content}`)
    .join('\n\n')

  const changed = i.aiDraft && i.aiDraft.trim() !== i.finalAnswer.trim()
  const interaction = [
    `Customer's message (Dutch):\n${i.customerMessage}`,
    i.aiDraft ? `AI draft${changed ? ' (the team did NOT send this as-is)' : ''}:\n${i.aiDraft}` : null,
    i.instructions?.length ? `Corrections the team gave the AI, in order:\n${i.instructions.map(s => `- ${s}`).join('\n')}` : null,
    `Reply the team actually sent${i.origin === 'manual' ? ' (typed by hand)' : ''}:\n${i.finalAnswer}`,
  ].filter(Boolean).join('\n\n')

  const system = `You maintain the customer service knowledge base for ${getWebsiteDomain()}. After every reply the team sends, you decide what future replies should learn from it.

Worth recording:
- Policies, procedures, product facts, delivery times, prices or exceptions stated in the team's reply that the knowledge base does not have yet.
- Corrections: where the team's reply or their instructions contradict the AI draft or an existing fact, record the correct version. When it corrects an existing fact, set replaces_id to that fact's id.
- Recurring ways of working the team shows, such as what they offer in a given situation or how they phrase things (topic writing-style).

Not worth recording:
- Anything about this specific customer or order: names, order numbers, addresses, personal circumstances, one-off arrangements.
- Small talk, confirmations, thanks.
- Facts already present in the knowledge base below, in any wording.

Write each fact in Dutch as a standalone statement that makes sense without this conversation. Most interactions teach nothing new: an empty list is the normal outcome. Call record_facts exactly once.

## Topics
${KNOWLEDGE_TOPICS.map(t => `- ${t.slug}: ${t.title}`).join('\n')}

## Knowledge base: topic files
${topicFiles || '(empty)'}

## Knowledge base: learned facts
${existing.length ? existing.map(f => `[${f.id}] (${f.topic}) ${f.fact}`).join('\n') : '(none yet)'}`

  const model = await resolveModel()
  const response = await getClient().messages.create({
    model,
    max_tokens: 8000,
    ...requestParams(model, 'medium'),
    system,
    messages: [{ role: 'user', content: interaction }],
    tools: [RECORD_FACTS_TOOL],
    tool_choice: { type: 'auto' },
  })
  logTokens(i.conversationId, 'knowledge_update', response.usage)
  if (response.stop_reason === 'refusal') throw new Error('Claude heeft dit verzoek geweigerd')

  const call = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === RECORD_FACTS_TOOL.name,
  )
  return (call?.input as { facts?: LearnedFact[] } | undefined)?.facts ?? []
}

// Laatste klantbericht in het Nederlands, als context voor wat er geleerd wordt.
export function lastInboundDutch(conversationId: number): string | null {
  const row = getDb().prepare(`
    SELECT content, content_dutch FROM messages WHERE conversation_id = ? AND direction = 'inbound'
    ORDER BY sent_at DESC LIMIT 1
  `).get(conversationId) as { content: string; content_dutch: string | null } | undefined
  return row ? row.content_dutch || row.content : null
}
