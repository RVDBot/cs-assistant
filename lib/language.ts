// Wanneer de taal van een gesprek opnieuw bepaald mag worden. Zonder imports, zodat
// de tests in tests/ dit bestand direct met `node --test` kunnen laden.

/** Messages shorter than this keep the conversation's language ("Thanks", "Thanks for your help!"). */
export const MIN_WORDS_TO_SWITCH = 6

/**
 * Whether an incoming message should re-detect the conversation's language.
 * A short reply in another language ("Thanks") must not flip a Dutch conversation to
 * English; only a real message does. A language set by hand is never overwritten, and
 * the first message of a conversation is always detected.
 */
export function shouldDetectLanguage(p: { current: string | null; manual: boolean; known: boolean; text: string }): boolean {
  if (p.manual) return false
  if (!p.known || !p.current) return true
  const words = p.text.trim().split(/\s+/).filter(w => /\p{L}/u.test(w))
  return words.length >= MIN_WORDS_TO_SWITCH
}
