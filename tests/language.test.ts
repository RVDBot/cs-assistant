import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldDetectLanguage } from '../lib/language.ts'

const nl = { current: 'nl', manual: false, known: true }

test('a short message never switches an established language', () => {
  assert.equal(shouldDetectLanguage({ ...nl, text: 'Thanks' }), false)
  assert.equal(shouldDetectLanguage({ ...nl, text: 'Thanks for your help!' }), false)
  assert.equal(shouldDetectLanguage({ ...nl, text: 'ok 👍' }), false)
})

test('a real message in another language is detected again', () => {
  assert.equal(shouldDetectLanguage({ ...nl, text: 'Hi, I ordered a rope last week but it has not arrived yet' }), true)
})

test('a language chosen by hand is never overwritten', () => {
  assert.equal(shouldDetectLanguage({ ...nl, manual: true, text: 'Hi, I ordered a rope last week but it has not arrived yet' }), false)
})

test('the first message of a conversation is always detected, however short', () => {
  assert.equal(shouldDetectLanguage({ current: 'en', manual: false, known: false, text: 'Hallo' }), true)
})
