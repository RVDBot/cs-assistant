import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDbTime, formatTimestamp, formatNow, dayPart, shouldGreet, type TimedMessage } from '../lib/conversation-context.ts'

const at = (iso: string) => new Date(iso)
const msg = (direction: 'inbound' | 'outbound', iso: string): TimedMessage => ({ direction, sentAt: at(iso) })

test('parseDbTime reads SQLite timestamps as UTC', () => {
  assert.equal(parseDbTime('2026-10-14 07:12:00').toISOString(), '2026-10-14T07:12:00.000Z')
  assert.equal(parseDbTime('2026-10-14T07:12:00Z').toISOString(), '2026-10-14T07:12:00.000Z')
  assert.equal(parseDbTime('2026-10-14T09:12:00+02:00').toISOString(), '2026-10-14T07:12:00.000Z')
})

test('timestamps are shown in Amsterdam time, including DST', () => {
  // Zomertijd (UTC+2)
  assert.equal(formatTimestamp(at('2026-10-14T07:12:00Z')), 'wo 14 okt 09:12')
  // Wintertijd (UTC+1)
  assert.equal(formatTimestamp(at('2026-12-01T07:05:00Z')), 'di 1 dec 08:05')
  assert.match(formatNow(at('2026-10-14T07:12:00Z')), /^woensdag 14 oktober 2026, 09:12$/)
})

test('dayPart follows Amsterdam hours', () => {
  assert.equal(dayPart(at('2026-10-14T07:00:00Z')), 'ochtend') // 09:00
  assert.equal(dayPart(at('2026-10-14T10:30:00Z')), 'middag') // 12:30
  assert.equal(dayPart(at('2026-10-14T17:00:00Z')), 'avond') // 19:00
  assert.equal(dayPart(at('2026-10-14T01:00:00Z')), 'nacht') // 03:00
})

const now = at('2026-10-14T10:00:00Z')

test('greets when we have never replied', () => {
  assert.equal(shouldGreet([msg('inbound', '2026-10-14T09:59:00Z')], now, 'whatsapp'), true)
})

test('does not greet in an ongoing chat', () => {
  const m = [
    msg('inbound', '2026-10-14T08:00:00Z'),
    msg('outbound', '2026-10-14T08:05:00Z'),
    msg('inbound', '2026-10-14T09:59:00Z'),
  ]
  assert.equal(shouldGreet(m, now, 'whatsapp'), false)
})

test('greets when the customer returns after 12 hours or more', () => {
  const m = [
    msg('outbound', '2026-10-13T21:00:00Z'),
    msg('inbound', '2026-10-14T09:00:00Z'),
  ]
  assert.equal(shouldGreet(m, now, 'whatsapp'), true)
})

test('a burst of customer messages counts from the first one', () => {
  // Klant schreef 13 uur na ons, en daarna nog eens vlak voor nu: blijft een begroeting
  const m = [
    msg('outbound', '2026-10-13T19:00:00Z'),
    msg('inbound', '2026-10-14T08:00:00Z'),
    msg('inbound', '2026-10-14T09:58:00Z'),
  ]
  assert.equal(shouldGreet(m, now, 'whatsapp'), true)
})

test('just under 12 hours does not greet', () => {
  const m = [
    msg('outbound', '2026-10-13T22:01:00Z'),
    msg('inbound', '2026-10-14T10:00:00Z'),
  ]
  assert.equal(shouldGreet(m, now, 'whatsapp'), false)
})

test('a follow-up without a new customer message counts from now', () => {
  assert.equal(shouldGreet([msg('outbound', '2026-10-14T09:00:00Z')], now, 'whatsapp'), false)
  assert.equal(shouldGreet([msg('outbound', '2026-10-13T09:00:00Z')], now, 'whatsapp'), true)
})

test('email always greets', () => {
  const m = [msg('outbound', '2026-10-14T09:00:00Z'), msg('inbound', '2026-10-14T09:30:00Z')]
  assert.equal(shouldGreet(m, now, 'email'), true)
})
