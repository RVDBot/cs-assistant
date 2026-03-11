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
  { slug: 'returns', title: 'Return Instructions', description: 'How customers can return products' },
  { slug: 'product-information', title: 'Product Information', description: 'Where to find specs, manuals, availability' },
  { slug: 'shipping-delivery', title: 'Shipping & Delivery', description: 'Shipping times, tracking, carriers' },
  { slug: 'warranty-repairs', title: 'Warranty & Repairs', description: 'Warranty terms and repair procedures' },
  { slug: 'order-tracking', title: 'Order Status & Tracking', description: 'How to track orders' },
  { slug: 'order-changes', title: 'Order Changes & Cancellations', description: 'Modifying or cancelling orders' },
  { slug: 'payment-refunds', title: 'Payment Issues & Refunds', description: 'Payment problems and refund process' },
  { slug: 'account-help', title: 'Account Help', description: 'Account creation and login assistance' },
  { slug: 'password-reset', title: 'Password Reset', description: 'How to reset a password' },
  { slug: 'subscription', title: 'Subscription Management', description: 'Managing subscriptions' },
  { slug: 'troubleshooting', title: 'Troubleshooting & FAQs', description: 'Common issues and solutions' },
  { slug: 'compatibility', title: 'Compatibility Questions', description: 'Product compatibility information' },
  { slug: 'product-comparisons', title: 'Product Comparisons', description: 'Comparing products' },
  { slug: 'discounts-vouchers', title: 'Discount Codes & Vouchers', description: 'Applying discounts and vouchers' },
  { slug: 'price-matching', title: 'Price Matching', description: 'Price match policy' },
  { slug: 'loyalty-program', title: 'Loyalty Program', description: 'Loyalty program details' },
  { slug: 'opening-hours', title: 'Opening Hours & Availability', description: 'When support is available' },
  { slug: 'escalation', title: 'Escalation to Human Agent', description: 'When and how to escalate' },
  { slug: 'complaints', title: 'Complaint Handling', description: 'How to handle complaints' },
  { slug: 'spare-parts', title: 'Spare Parts', description: 'Ordering spare parts' },
  { slug: 'installation-support', title: 'Installation Support', description: 'Help with installation' },
  { slug: 'recycling-disposal', title: 'Recycling & Disposal', description: 'Eco-friendly disposal options' },
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
