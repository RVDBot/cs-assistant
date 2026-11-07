// Bouwt de tekst- en HTML-versie van een uitgaande mail met handtekening. Zonder
// relatieve imports, zodat de tests in tests/ dit bestand direct kunnen laden.
import { convert } from 'html-to-text'
import sanitizeHtml from 'sanitize-html'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Plain-text body plus the account's HTML signature. Without a signature the mail
 * stays text-only; with one, an HTML part is added and the text part gets a
 * text rendering of the signature after the standard "-- " delimiter.
 */
export function buildEmailBodies(body: string, signatureHtml: string | null | undefined): { text: string; html?: string } {
  const signature = (signatureHtml || '').trim()
  if (!signature) return { text: body }

  const bodyHtml = escapeHtml(body).replace(/\r?\n/g, '<br>\n')
  const signatureText = convert(signature, { wordwrap: false, selectors: [{ selector: 'img', format: 'skip' }] }).trim()

  return {
    text: `${body}\n\n-- \n${signatureText}`,
    html: `<div>${bodyHtml}</div><br>\n<div class="signature">${signature}</div>`,
  }
}

/**
 * Cleans a pasted signature (from Gmail, Outlook, a generator…) before it is stored
 * and sent: keeps layout, inline styles, links and images; drops scripts, event
 * handlers, javascript: links and Office paste junk.
 */
export function sanitizeSignature(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'div', 'span', 'br', 'hr', 'b', 'strong', 'i', 'em', 'u', 's', 'small', 'big', 'font', 'sub', 'sup',
      'a', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'col', 'colgroup',
      'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'center',
    ],
    allowedAttributes: {
      '*': ['style', 'class', 'align', 'valign', 'width', 'height', 'bgcolor', 'dir'],
      a: ['href', 'target', 'rel', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height', 'border'],
      table: ['cellpadding', 'cellspacing', 'border', 'role'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
      font: ['color', 'face', 'size'],
    },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https', 'http', 'data'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'title', 'head'],
  }).trim()
}
