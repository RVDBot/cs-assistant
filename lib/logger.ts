import { getDb } from './db'

export type LogLevel = 'info' | 'warn' | 'error'
export type LogCategory = 'bericht' | 'ai' | 'twilio' | 'systeem' | 'media'

export function log(
  level: LogLevel,
  category: LogCategory,
  message: string,
  meta?: Record<string, unknown>,
  conversationId?: number,
) {
  try {
    getDb().prepare(`
      INSERT INTO logs (level, category, message, meta, conversation_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(level, category, message, meta ? JSON.stringify(meta) : null, conversationId ?? null)
  } catch (e) {
    console.error('Logger failed:', e)
  }
}
