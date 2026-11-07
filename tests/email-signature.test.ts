import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEmailBodies } from '../lib/email-signature.ts'

test('without a signature the mail stays plain text', () => {
  assert.deepEqual(buildEmailBodies('Hoi,\nprima!', ''), { text: 'Hoi,\nprima!' })
  assert.deepEqual(buildEmailBodies('Hoi', null), { text: 'Hoi' })
})

test('with a signature an HTML body is added, and the text body gets a text version', () => {
  const out = buildEmailBodies('Hoi <Jan>,\n\nprima & bedankt!', '<p><b>Ruben</b><br>Speed Rope Shop</p>')
  assert.equal(out.html, '<div>Hoi &lt;Jan&gt;,<br>\n<br>\nprima &amp; bedankt!</div><br>\n<div class="signature"><p><b>Ruben</b><br>Speed Rope Shop</p></div>')
  assert.match(out.text, /^Hoi <Jan>,\n\nprima & bedankt!\n\n-- \n/)
  assert.match(out.text, /Ruben/)
  assert.match(out.text, /Speed Rope Shop/)
  assert.doesNotMatch(out.text, /<b>|<p>/)
})
