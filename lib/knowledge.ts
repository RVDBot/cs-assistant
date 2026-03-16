import fs from 'fs'
import path from 'path'

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

export async function getKnowledgeContext(): Promise<string> {
  const files = getAllKnowledgeFiles().filter(f => f.content.trim().length > 0)
  if (!files.length) return ''
  return files
    .map(f => `### ${f.title}\n${f.content}`)
    .join('\n\n---\n\n')
}
