// Tijd- en begroetingslogica voor AI-antwoorden. Bewust zonder imports, zodat de
// tests in tests/ dit bestand direct met `node --test` kunnen laden.

const TIME_ZONE = 'Europe/Amsterdam'
export const GREETING_GAP_HOURS = 12

export type DayPart = 'nacht' | 'ochtend' | 'middag' | 'avond'

// SQLite's CURRENT_TIMESTAMP is UTC zonder zone-aanduiding ("2026-10-14 07:12:00").
export function parseDbTime(value: string): Date {
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(value)) return new Date(value)
  return new Date(value.replace(' ', 'T') + 'Z')
}

function amsterdamParts(date: Date) {
  const parts = new Intl.DateTimeFormat('nl-NL', {
    timeZone: TIME_ZONE,
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return {
    weekday: get('weekday').replace('.', ''),
    day: get('day'),
    month: get('month').replace('.', ''),
    year: get('year'),
    hour: Number(get('hour')) % 24,
    minute: get('minute'),
  }
}

// "di 14 okt 09:12"
export function formatTimestamp(date: Date): string {
  const p = amsterdamParts(date)
  return `${p.weekday} ${p.day} ${p.month} ${String(p.hour).padStart(2, '0')}:${p.minute}`
}

// "dinsdag 14 oktober 2026, 09:12"
export function formatNow(date: Date): string {
  const long = new Intl.DateTimeFormat('nl-NL', {
    timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(date)
  const p = amsterdamParts(date)
  return `${long}, ${String(p.hour).padStart(2, '0')}:${p.minute}`
}

export function dayPart(date: Date): DayPart {
  const h = amsterdamParts(date).hour
  if (h < 6) return 'nacht'
  if (h < 12) return 'ochtend'
  if (h < 18) return 'middag'
  return 'avond'
}

export interface TimedMessage {
  direction: 'inbound' | 'outbound'
  sentAt: Date
}

// Groeten bij e-mail altijd; bij WhatsApp alleen bij ons eerste bericht in het gesprek,
// of als er sinds ons laatste bericht minstens 12 uur verstreken is voordat de klant
// weer schreef. Meerdere klantberichten achter elkaar tellen vanaf het eerste.
export function shouldGreet(messages: TimedMessage[], now: Date, channel: 'whatsapp' | 'email'): boolean {
  if (channel === 'email') return true
  const sorted = [...messages].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
  const lastOutbound = [...sorted].reverse().find(m => m.direction === 'outbound')
  if (!lastOutbound) return true
  const firstInboundAfter = sorted.find(m => m.direction === 'inbound' && m.sentAt > lastOutbound.sentAt)
  const reference = firstInboundAfter?.sentAt ?? now
  return reference.getTime() - lastOutbound.sentAt.getTime() >= GREETING_GAP_HOURS * 60 * 60 * 1000
}
