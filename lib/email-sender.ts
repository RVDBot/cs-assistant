// Bepaalt wie de klant achter een binnenkomende mail is. Bewust zonder imports,
// zodat de tests in tests/ dit bestand direct met `node --test` kunnen laden.

type Address = { address?: string; name?: string }

/**
 * Website forms (e.g. via WP Mail SMTP) send every request from the same site
 * address and put the customer in Reply-To. Grouping on From would lump all those
 * customers into one conversation, so Reply-To wins when it names someone else.
 */
export function resolveCustomer(
  envelope: { from?: Address[]; replyTo?: Address[] },
  ourAddresses: Set<string>,
): { address: string; name: string } {
  const from = envelope.from?.[0]
  const fromAddr = from?.address?.toLowerCase() || ''
  const reply = envelope.replyTo?.[0]
  const replyAddr = reply?.address?.toLowerCase() || ''

  if (replyAddr && replyAddr !== fromAddr && !ourAddresses.has(replyAddr)) {
    return { address: replyAddr, name: reply?.name || '' }
  }
  return { address: fromAddr, name: from?.name || '' }
}

/**
 * For messages already stored under the wrong conversation (e.g. form mail grouped
 * under the site address), work out which customer each one belongs to. Messages
 * whose original mail can't be found, or that already sit with the right customer,
 * are left out.
 */
export function planFormSplit(
  messages: Array<{ id: number; conversationEmail: string | null; messageId: string }>,
  envelopes: Map<string, { from?: Address[]; replyTo?: Address[] }>,
  ourAddresses: Set<string>,
): Array<{ messageRowId: number; address: string; name: string }> {
  const plan: Array<{ messageRowId: number; address: string; name: string }> = []
  for (const m of messages) {
    const envelope = envelopes.get(m.messageId)
    if (!envelope) continue
    const customer = resolveCustomer(envelope, ourAddresses)
    const fromAddr = envelope.from?.[0]?.address?.toLowerCase() || ''
    // Only form-style mail (Reply-To names someone other than the sender); leave merged conversations alone
    if (!customer.address || customer.address === fromAddr) continue
    if (customer.address === (m.conversationEmail || '').toLowerCase()) continue
    plan.push({ messageRowId: m.id, address: customer.address, name: customer.name })
  }
  return plan
}
