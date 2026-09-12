import { isContentSid } from './twilio'

export type VariantInput = { language?: string; content_sid?: string; preview?: string | null }

/** Geeft een foutmelding terug zodra een variant geen geldige Content SID heeft, anders null. */
export function validateVariants(variants: VariantInput[]): string | null {
  const bad = variants.filter(v => v.language && !isContentSid(v.content_sid))
  if (bad.length === 0) return null
  const langs = bad.map(v => (v.language || '?').toUpperCase()).join(', ')
  return `Ongeldige Content SID bij ${langs}. Een Content SID begint met HX gevolgd door 32 tekens (bijv. HX4c6c97488f3390d3a531eec43c452359) — vul hier niet de previewtekst in.`
}
