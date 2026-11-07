import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mailDateToDb } from '../lib/email-cutoff.ts'

const now = new Date('2026-11-07T20:33:00Z')

test('a mail date becomes a SQLite UTC timestamp', () => {
  assert.equal(mailDateToDb(new Date('2026-10-10T09:15:30+02:00'), now), '2026-10-10 07:15:30')
  assert.equal(mailDateToDb('2026-10-10T07:15:30Z', now), '2026-10-10 07:15:30')
})

test('missing, invalid or future dates fall back to now', () => {
  assert.equal(mailDateToDb(undefined, now), '2026-11-07 20:33:00')
  assert.equal(mailDateToDb('not a date', now), '2026-11-07 20:33:00')
  assert.equal(mailDateToDb(new Date('2027-01-01T00:00:00Z'), now), '2026-11-07 20:33:00')
})
