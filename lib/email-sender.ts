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
