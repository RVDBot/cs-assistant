import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveCustomer } from '../lib/email-sender.ts'

const ours = new Set(['ruben@speedropeshop.com'])

test('a website form mail is attributed to the Reply-To address, not the site sender', () => {
  assert.deepEqual(
    resolveCustomer({
      from: [{ address: 'WordPress@SpeedRopeShop.com', name: 'Speed Rope Shop' }],
      replyTo: [{ address: 'ElaineAsker@yahoo.co.uk', name: 'Elaine Asker' }],
    }, ours),
    { address: 'elaineasker@yahoo.co.uk', name: 'Elaine Asker' },
  )
})

test('a normal mail without Reply-To uses From', () => {
  assert.deepEqual(
    resolveCustomer({ from: [{ address: 'judith@gmail.com', name: 'Judith' }] }, ours),
    { address: 'judith@gmail.com', name: 'Judith' },
  )
})

test('Reply-To equal to From changes nothing', () => {
  assert.deepEqual(
    resolveCustomer({
      from: [{ address: 'a@x.com', name: 'A' }],
      replyTo: [{ address: 'a@x.com', name: '' }],
    }, ours),
    { address: 'a@x.com', name: 'A' },
  )
})

test('a Reply-To pointing at one of our own addresses is ignored', () => {
  assert.deepEqual(
    resolveCustomer({
      from: [{ address: 'klant@x.com', name: 'Klant' }],
      replyTo: [{ address: 'ruben@speedropeshop.com', name: 'Ruben' }],
    }, ours),
    { address: 'klant@x.com', name: 'Klant' },
  )
})
