import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signToken, readToken, needsRefresh, SESSION_MAX_AGE_MS } from '../lib/auth-token.ts'

const secret = 'test-secret'
const DAY = 24 * 60 * 60 * 1000
const now = Date.parse('2026-11-08T10:00:00Z')

test('a fresh token is valid and does not need a refresh yet', async () => {
  const token = await signToken(secret, now)
  assert.equal(await readToken(token, secret, now + 1000), now)
  assert.equal(needsRefresh(now, now + 1000), false)
})

test('a token used again after a day is refreshed, so the session slides along', () => {
  assert.equal(needsRefresh(now, now + DAY + 1), true)
})

test('a token older than the session lifetime, or signed with another secret, is rejected', async () => {
  const token = await signToken(secret, now)
  assert.equal(await readToken(token, secret, now + SESSION_MAX_AGE_MS + 1), null)
  assert.equal(await readToken(token, 'other-secret', now + 1000), null)
  assert.equal(await readToken('garbage', secret, now), null)
})

test('the session lasts 30 days without use', () => {
  assert.equal(SESSION_MAX_AGE_MS, 30 * DAY)
})
