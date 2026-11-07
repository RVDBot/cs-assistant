import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectNewUids } from '../lib/email-cutoff.ts'

const msg = (uid: number, iso: string | null) => ({ uid, internalDate: iso ? new Date(iso) : undefined })

test('skips unread mail that arrived before the account started polling', () => {
  const since = '2026-11-07 20:30:00' // SQLite UTC timestamp
  const uids = selectNewUids([
    msg(1, '2026-10-10T09:00:00Z'), // old backlog
    msg(2, '2026-11-07T20:29:59Z'), // just before
    msg(3, '2026-11-07T20:30:00Z'), // exactly at cutoff
    msg(4, '2026-11-07T21:00:00Z'), // new
  ], since)
  assert.deepEqual(uids, [3, 4])
})

test('without a cutoff every unread message is taken', () => {
  assert.deepEqual(selectNewUids([msg(1, '2020-01-01T00:00:00Z'), msg(2, null)], null), [1, 2])
})

test('a message without an arrival date is kept rather than silently dropped', () => {
  assert.deepEqual(selectNewUids([msg(5, null)], '2026-11-07 20:30:00'), [5])
})
