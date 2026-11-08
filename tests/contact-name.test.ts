import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatContactName } from '../lib/utils.ts'

test('name with contact detail in brackets', () => {
  assert.equal(formatContactName('Elaine Asker', '', 'elaine@yahoo.co.uk'), 'Elaine Asker (elaine@yahoo.co.uk)')
})

test('a name that is just the email address is not repeated in brackets', () => {
  assert.equal(formatContactName('fernandarozendom@gmail.com', '', 'fernandarozendom@gmail.com'), 'fernandarozendom@gmail.com')
  assert.equal(formatContactName('Fernanda@Gmail.com ', '', 'fernanda@gmail.com'), 'fernanda@gmail.com')
})

test('no name falls back to the contact detail', () => {
  assert.equal(formatContactName(null, '', 'a@b.nl'), 'a@b.nl')
})
