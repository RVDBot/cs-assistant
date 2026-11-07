import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planFormSplit } from '../lib/email-sender.ts'

const ours = new Set(['ruben@speedropeshop.com'])
const site = { address: 'wordpress@speedropeshop.com', name: 'Speed Rope Shop' }

test('form mails in the site conversation are reassigned to their Reply-To customer', () => {
  const plan = planFormSplit(
    [
      { id: 1, conversationEmail: 'wordpress@speedropeshop.com', messageId: '<a@x>' },
      { id: 2, conversationEmail: 'wordpress@speedropeshop.com', messageId: '<b@x>' },
      { id: 3, conversationEmail: 'judith@gmail.com', messageId: '<c@x>' },
      { id: 4, conversationEmail: 'wordpress@speedropeshop.com', messageId: '<missing@x>' },
    ],
    new Map([
      ['<a@x>', { from: [site], replyTo: [{ address: 'Elaine@yahoo.co.uk', name: 'Elaine Asker' }] }],
      ['<b@x>', { from: [site], replyTo: [{ address: 'gara@press.es', name: 'Gara' }] }],
      ['<c@x>', { from: [{ address: 'judith@gmail.com', name: 'Judith' }] }],
    ]),
    ours,
  )
  assert.deepEqual(plan, [
    { messageRowId: 1, address: 'elaine@yahoo.co.uk', name: 'Elaine Asker' },
    { messageRowId: 2, address: 'gara@press.es', name: 'Gara' },
  ])
})

test('normal mail in a merged conversation with another email is not moved', () => {
  const plan = planFormSplit(
    [{ id: 7, conversationEmail: 'old-address@x.com', messageId: '<d@x>' }],
    new Map([['<d@x>', { from: [{ address: 'new-address@x.com', name: 'Klant' }] }]]),
    ours,
  )
  assert.deepEqual(plan, [])
})
