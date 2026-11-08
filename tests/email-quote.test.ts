import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripQuotedHtml, stripQuotedText } from '../lib/email-quote.ts'

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

test('Apple Mail (NL): attribution + cite blockquote are removed', () => {
  const html = `<div>Beste Ruben,<br><br>Ik zag dat het pakket was bezorgd.<br><br>Groet, Judith</div>
    <div><br><blockquote type="cite"><div>Op 5 okt 2026 om 15:58 heeft Judith &lt;j@gmail.com&gt; het volgende geschreven:</div></blockquote></div>
    <blockquote type="cite"><div>Zaterdag heb ik het pakket verstuurd!</div>
      <blockquote type="cite">Op 1 okt 2026 heeft Ruben het volgende geschreven:<br>Hi Judith</blockquote>
    </blockquote>`
  const out = norm(stripQuotedHtml(html))
  assert.match(out, /Ik zag dat het pakket was bezorgd/)
  assert.doesNotMatch(out, /Zaterdag heb ik|Hi Judith|geschreven/)
})

test('Gmail quote block is removed', () => {
  const html = `<div dir="ltr">Thanks, that works!</div><br><div class="gmail_quote"><div class="gmail_attr">On Mon, Oct 5 Ruben wrote:</div><blockquote class="gmail_quote">old</blockquote></div>`
  assert.equal(norm(stripQuotedHtml(html)).includes('old'), false)
  assert.match(stripQuotedHtml(html), /Thanks, that works!/)
})

test('Proton and Outlook quotes are removed', () => {
  assert.doesNotMatch(stripQuotedHtml(`<div>Nieuw</div><div class="protonmail_quote">Oud</div>`), /Oud/)
  const outlook = `<div>New text</div><div id="appendonsend"></div><hr><div id="divRplyFwdMsg"><b>From:</b> Ruben</div><div>Old text</div>`
  const out = stripQuotedHtml(outlook)
  assert.match(out, /New text/)
  assert.doesNotMatch(out, /Old text|From:/)
})

test('a website form mail without quotes is left alone', () => {
  const html = `<p>Help request received from Elaine Asker</p><p>Hi, I lost the screw.</p><p><b>Elaine Asker</b></p>`
  assert.equal(norm(stripQuotedHtml(html)), norm(html))
})

test('if stripping would leave nothing (e.g. a pure forward), the original is kept', () => {
  const html = `<blockquote type="cite">Only quoted content</blockquote>`
  assert.match(stripQuotedHtml(html), /Only quoted content/)
})

test('plain text: Dutch "heeft ... geschreven:" attribution, also wrapped over two lines', () => {
  const text = 'Beste Ruben,\n\nIk zag dat het pakket was bezorgd.\n\nOp 5 okt 2026 om 15:58 heeft Judith <j@gmail.com> het volgende\ngeschreven:\n\nZaterdag heb ik het pakket verstuurd'
  assert.equal(stripQuotedText(text), 'Beste Ruben,\n\nIk zag dat het pakket was bezorgd.')
})

test('plain text: English attribution and > quotes', () => {
  assert.equal(stripQuotedText('Thanks!\n\nOn Mon, Oct 5, 2026 at 9:00 Ruben <r@x.com> wrote:\n> old'), 'Thanks!')
  assert.equal(stripQuotedText('Yes\n> old line'), 'Yes')
})

test('plain text without quotes is unchanged', () => {
  assert.equal(stripQuotedText('Hello,\nI lost the screw.'), 'Hello,\nI lost the screw.')
})

import { htmlToPlainText } from '../lib/email-quote.ts'

test('plain text from HTML keeps line breaks but drops link targets and tracking images', () => {
  const html = `<p>Help request received from Elaine Asker</p><p>Hi,<br>I lost the screw.<br>Thankyou</p>
    <p><b>Elaine Asker</b><br><a href="mailto:elaineasker@yahoo.co.uk">elaineasker@yahoo.co.uk</a></p>
    <img src="https://speedropeshop.com/wp-json/wp-mail-smtp/v1/e/ZGF0YSU1QmVtYWlsX2xvZ19pZCU1RD02" width="1" height="1">
    <p><a href="https://speedropeshop.com/wp-json/wp-mail-smtp/v1/c/abc">Bekijk bestelling</a></p>`
  assert.equal(
    htmlToPlainText(html),
    'Help request received from Elaine Asker\n\nHi,\nI lost the screw.\nThankyou\n\nElaine Asker\nelaineasker@yahoo.co.uk\n\nBekijk bestelling',
  )
})
