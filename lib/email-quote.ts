// Haalt de geciteerde voorgeschiedenis uit binnenkomende mail, zodat elk bericht
// in de chat alleen het nieuwe stuk toont. Zonder relatieve imports, zodat de
// tests in tests/ dit bestand direct met `node --test` kunnen laden.
import * as cheerio from 'cheerio'
import { convert } from 'html-to-text'

// "On … wrote:", "Op … schreef …:", "Op … heeft … (het volgende) geschreven:", etc.
const ATTRIBUTION = [
  /^On .+ wrote:$/i,
  /^Op .+ schreef .*:$/i,
  /^Op .+ heeft .+ geschreven:$/i,
  /^Am .+ schrieb .*:$/i,
  /^Le .+ a écrit\s?:$/i,
  /^El .+ escribió:$/i,
  /^Il .+ ha scritto:$/i,
]
const SEPARATORS = [
  /^-{3,}\s*(Original Message|Oorspronkelijk bericht|Ursprüngliche Nachricht|Message d'origine)\s*-{3,}/i,
  /^_{5,}$/,
  /^(From|Van|Von|De):\s/,
]

const isAttribution = (line: string) => ATTRIBUTION.some(p => p.test(line.trim()))

export function stripQuotedText(text: string): string {
  const lines = text.split('\n')
  let cut = lines.length
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const joined = `${line} ${(lines[i + 1] || '').trim()}`.trim()
    if (isAttribution(line) || isAttribution(joined) || SEPARATORS.some(p => p.test(line)) || /^>/.test(line)) {
      cut = i
      break
    }
  }
  const result = lines.slice(0, cut).join('\n').trim()
  return result || text.trim()
}

// Containers that mail clients wrap around quoted history
const QUOTE_SELECTORS = [
  '.gmail_quote', '.gmail_extra', '.gmail_attr',
  '.protonmail_quote',
  '.yahoo_quoted', '#yahoo_quoted',
  '.moz-cite-prefix',
  '[data-marker="__QUOTED_TEXT__"]', '[data-marker="__HEADERS__"]',
  'blockquote',
].join(',')

export function stripQuotedHtml(html: string): string {
  const $ = cheerio.load(html, null, false)

  // Outlook: everything from the reply header onwards is history
  const outlookStart = $('#appendonsend, #divRplyFwdMsg, #x_divRplyFwdMsg').first()
  if (outlookStart.length) {
    let node = outlookStart.prev().is('hr') ? outlookStart.prev() : outlookStart
    // Walk up to a top-level node so following siblings cover the rest of the mail
    while (node.parent().length && !node.parent().is('body, html') && node.parent().get(0) !== $.root().get(0)) {
      node = node.parent()
    }
    node.nextAll().remove()
    node.remove()
  }

  $(QUOTE_SELECTORS).remove()

  // Attribution lines left behind outside a quote container ("Op … heeft … geschreven:")
  $('div, p, span').each((_, el) => {
    const $el = $(el)
    if ($el.children('div, p, blockquote').length) return
    if (isAttribution($el.text().replace(/\s+/g, ' '))) $el.remove()
  })

  const result = $.html().trim()
  const hasContent = $.root().text().trim().length > 0 || $('img').length > 0
  return hasContent ? result : html
}

/**
 * Readable plain text from mail HTML: keeps paragraphs and line breaks, shows link
 * text without the target (no "[mailto:…]" or tracking URLs) and skips images.
 */
export function htmlToPlainText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
      { selector: 'h1', options: { uppercase: false } },
      { selector: 'h2', options: { uppercase: false } },
      { selector: 'h3', options: { uppercase: false } },
      { selector: 'table', format: 'block' },
      { selector: 'tr', format: 'block' },
      { selector: 'td', format: 'inline' },
      { selector: 'th', format: 'inline' },
    ],
  }).replace(/\n{3,}/g, '\n\n').trim()
}
