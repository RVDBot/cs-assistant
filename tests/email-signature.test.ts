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

import { sanitizeSignature } from '../lib/email-signature.ts'

test('pasted signature keeps layout, links and https images', () => {
  const html = '<table style="font-family:Arial"><tr><td><img src="https://speedropeshop.com/logo.png" width="80" alt="logo"></td><td><b style="color:#e00">Ruben</b><br><a href="https://speedropeshop.com" target="_blank">speedropeshop.com</a><br><a href="tel:+31612345678">+31 6 1234 5678</a></td></tr></table>'
  const out = sanitizeSignature(html)
  assert.match(out, /<table style="font-family:Arial">/)
  assert.match(out, /<img src="https:\/\/speedropeshop.com\/logo.png" width="80" alt="logo" \/>/)
  assert.match(out, /<b style="color:#e00">Ruben<\/b>/)
  assert.match(out, /href="tel:\+31612345678"/)
})

test('scripts, event handlers and javascript: links are removed', () => {
  const out = sanitizeSignature('<p onclick="x()">Hi<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">l</a></p>')
  assert.doesNotMatch(out, /script|onclick|onerror|javascript:/)
  assert.match(out, /Hi/)
})

test('Word/Outlook paste junk (comments, meta, style blocks) is dropped', () => {
  const out = sanitizeSignature('<meta charset="utf-8"><style>p{margin:0}</style><!--[if gte mso 9]>x<![endif]--><p class="MsoNormal">Groet</p>')
  assert.equal(out, '<p class="MsoNormal">Groet</p>')
})
