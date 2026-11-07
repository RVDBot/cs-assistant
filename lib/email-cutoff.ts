// Bepaalt welke ongelezen mails de poller mag verwerken. Bewust zonder imports,
// zodat de tests in tests/ dit bestand direct met `node --test` kunnen laden.

function parseDbTime(value: string): Date {
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(value)) return new Date(value)
  return new Date(value.replace(' ', 'T') + 'Z')
}

/**
 * Keeps only messages that arrived on or after `pollSince` (SQLite UTC timestamp),
 * so an old unread backlog in a mailbox is not imported as new conversations.
 * Messages without an arrival date are kept: dropping mail silently is worse.
 */
export function selectNewUids(
  messages: Array<{ uid: number; internalDate?: Date | string }>,
  pollSince: string | null | undefined,
): number[] {
  if (!pollSince) return messages.map(m => m.uid)
  const cutoff = parseDbTime(pollSince).getTime()
  return messages
    .filter(m => {
      if (!m.internalDate) return true
      const arrived = new Date(m.internalDate).getTime()
      return Number.isNaN(arrived) || arrived >= cutoff
    })
    .map(m => m.uid)
}
