// Bouwt de tekst- en HTML-versie van een uitgaande mail met handtekening. Zonder
// relatieve imports, zodat de tests in tests/ dit bestand direct kunnen laden.
import { convert } from 'html-to-text'

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
