import fs from 'fs'
import path from 'path'
import { getDb } from './db'

const KNOWLEDGE_DIR = path.join(process.cwd(), 'knowledge')

export interface KnowledgeFile {
  slug: string
  title: string
  content: string
  updatedAt: string
}

export const KNOWLEDGE_TOPICS: { slug: string; title: string; description: string }[] = [
  { slug: 'returns', title: 'Retourinstructies', description: 'Hoe klanten producten kunnen retourneren' },
  { slug: 'product-information', title: 'Productinformatie', description: 'Specificaties, handleidingen en beschikbaarheid' },
  { slug: 'shipping-delivery', title: 'Verzending & Levering', description: 'Levertijden, tracking en vervoerders' },
  { slug: 'warranty-repairs', title: 'Garantie & Reparaties', description: 'Garantievoorwaarden en reparatieprocedures' },
  { slug: 'order-tracking', title: 'Bestellingstatus & Tracking', description: 'Hoe bestellingen gevolgd kunnen worden' },
  { slug: 'order-changes', title: 'Bestellingen Wijzigen & Annuleren', description: 'Bestellingen aanpassen of annuleren' },
  { slug: 'payment-refunds', title: 'Betalingsproblemen & Terugbetalingen', description: 'Betalingsproblemen en terugbetalingsproces' },
  { slug: 'account-help', title: 'Accountbeheer', description: 'Account aanmaken en inlogproblemen oplossen' },
  { slug: 'password-reset', title: 'Wachtwoord Opnieuw Instellen', description: 'Hoe een wachtwoord gereset kan worden' },
  { slug: 'subscription', title: 'Abonnementsbeheer', description: 'Abonnementen beheren en aanpassen' },
  { slug: 'troubleshooting', title: 'Probleemoplossing & Veelgestelde Vragen', description: 'Veelvoorkomende problemen en oplossingen' },
  { slug: 'compatibility', title: 'Compatibiliteitsvragen', description: 'Informatie over productcompatibiliteit' },
  { slug: 'product-comparisons', title: 'Productvergelijkingen', description: 'Producten met elkaar vergelijken' },
  { slug: 'discounts-vouchers', title: 'Kortingscodes & Vouchers', description: 'Kortingen en vouchers toepassen' },
  { slug: 'price-matching', title: 'Prijsgarantie', description: 'Beleid rondom prijsaanpassing' },
  { slug: 'loyalty-program', title: 'Loyaliteitsprogramma', description: 'Details van het loyaliteitsprogramma' },
  { slug: 'opening-hours', title: 'Openingstijden & Bereikbaarheid', description: 'Wanneer klantenservice beschikbaar is' },
  { slug: 'escalation', title: 'Doorverbinden naar Medewerker', description: 'Wanneer en hoe door te verbinden' },
  { slug: 'complaints', title: 'Klachtenafhandeling', description: 'Hoe klachten worden behandeld' },
  { slug: 'spare-parts', title: 'Reserveonderdelen', description: 'Reserveonderdelen bestellen' },
  { slug: 'installation-support', title: 'Installatieondersteuning', description: 'Hulp bij installatie' },
  { slug: 'recycling-disposal', title: 'Recycling & Afvoer', description: 'Milieuvriendelijke afvoeringsmogelijkheden' },
  { slug: 'writing-style', title: 'Schrijfstijl & Werkwijze', description: 'Hoe wij klanten te woord staan' },
]

function ensureDir() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true })
  }
}

export function getKnowledgeFile(slug: string): KnowledgeFile {
  ensureDir()
  const filePath = path.join(KNOWLEDGE_DIR, `${slug}.md`)
  const topic = KNOWLEDGE_TOPICS.find(t => t.slug === slug)
  const title = topic?.title || slug

  if (!fs.existsSync(filePath)) {
    return { slug, title, content: '', updatedAt: new Date().toISOString() }
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const stat = fs.statSync(filePath)
  return { slug, title, content, updatedAt: stat.mtime.toISOString() }
}

export function getAllKnowledgeFiles(): KnowledgeFile[] {
  return KNOWLEDGE_TOPICS.map(t => getKnowledgeFile(t.slug))
}

export function saveKnowledgeFile(slug: string, content: string): void {
  if (!KNOWLEDGE_TOPICS.some(t => t.slug === slug)) {
    throw new Error('Invalid slug')
  }
  ensureDir()
  const filePath = path.join(KNOWLEDGE_DIR, `${slug}.md`)
  fs.writeFileSync(filePath, content, 'utf-8')
}

export type FactSource = 'ai' | 'manual' | 'website' | 'team'

export interface KnowledgeFact {
  id: number
  topic: string
  fact: string
  source: FactSource
  conversation_id: number | null
  created_at: string
  updated_at: string
}

export function getFacts(topic?: string): KnowledgeFact[] {
  const db = getDb()
  return (topic
    ? db.prepare('SELECT * FROM knowledge_facts WHERE topic = ? ORDER BY created_at ASC, id ASC').all(topic)
    : db.prepare('SELECT * FROM knowledge_facts ORDER BY topic, created_at ASC, id ASC').all()) as KnowledgeFact[]
}

export function factCounts(): Record<string, number> {
  const rows = getDb().prepare('SELECT topic, COUNT(*) AS n FROM knowledge_facts GROUP BY topic').all() as { topic: string; n: number }[]
  return Object.fromEntries(rows.map(r => [r.topic, r.n]))
}

export function addFact(topic: string, fact: string, source: FactSource, conversationId: number | null): number {
  if (!KNOWLEDGE_TOPICS.some(t => t.slug === topic)) throw new Error('Invalid topic')
  const result = getDb().prepare(
    'INSERT INTO knowledge_facts (topic, fact, source, conversation_id) VALUES (?, ?, ?, ?)'
  ).run(topic, fact.trim(), source, conversationId)
  return Number(result.lastInsertRowid)
}

// Vervangt de tekst (en eventueel het onderwerp) van een bestaand feit. Geeft false als
// het feit niet (meer) bestaat, bijvoorbeeld omdat iemand het intussen verwijderde.
export function updateFact(id: number, fact: string, topic?: string): boolean {
  if (topic && !KNOWLEDGE_TOPICS.some(t => t.slug === topic)) throw new Error('Invalid topic')
  const result = getDb().prepare(
    'UPDATE knowledge_facts SET fact = ?, topic = COALESCE(?, topic), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(fact.trim(), topic ?? null, id)
  return result.changes > 0
}

export function deleteFact(id: number): void {
  getDb().prepare('DELETE FROM knowledge_facts WHERE id = ?').run(id)
}

// Onderwerpbestanden plus geleerde feiten per onderwerp, voor in de prompt.
export function getKnowledgeContext(): string {
  const facts = getFacts()
  const sections = KNOWLEDGE_TOPICS.map(t => {
    const file = getKnowledgeFile(t.slug).content.trim()
    const teamFacts = facts.filter(f => f.topic === t.slug && f.source !== 'website')
    const siteFacts = facts.filter(f => f.topic === t.slug && f.source === 'website')
    if (!file && !teamFacts.length && !siteFacts.length) return ''
    const parts = [file]
    if (teamFacts.length) {
      parts.push(`Geleerd van het team (gaat voor bij tegenstrijdigheid):\n${teamFacts.map(f => `- ${f.fact}`).join('\n')}`)
    }
    if (siteFacts.length) {
      parts.push(`Eerder van de website overgenomen (kan verouderd zijn, controleer bij twijfel live):\n${siteFacts.map(f => `- ${f.fact}`).join('\n')}`)
    }
    return `### ${t.title}\n${parts.filter(Boolean).join('\n\n')}`
  }).filter(Boolean)
  return sections.join('\n\n---\n\n')
}
