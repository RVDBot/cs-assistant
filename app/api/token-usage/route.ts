import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const CALL_TYPE_LABELS: Record<string, string> = {
  generate: 'Antwoord genereren',
  improve: 'Antwoord verbeteren',
  translate_inbound: 'Inkomend vertalen',
  translate_outbound: 'Uitgaand vertalen',
  detect_language: 'Taal detecteren',
  knowledge_update: 'Kennisbank bijwerken',
}

export async function GET(req: NextRequest) {
  const db = getDb()
  const conversationId = req.nextUrl.searchParams.get('conversation_id')

  if (conversationId) {
    const idNum = Number(conversationId)
    if (!Number.isInteger(idNum) || idNum < 1) {
      return NextResponse.json({ error: 'Invalid conversation_id' }, { status: 400 })
    }
    // Per-conversation stats
    const rows = db.prepare(`
      SELECT call_type,
             SUM(input_tokens)  AS input_tokens,
             SUM(output_tokens) AS output_tokens,
             COUNT(*)           AS calls
      FROM token_usage
      WHERE conversation_id = ?
      GROUP BY call_type
      ORDER BY call_type
    `).all(conversationId) as { call_type: string; input_tokens: number; output_tokens: number; calls: number }[]

    const totals = db.prepare(`
      SELECT SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, COUNT(*) AS calls
      FROM token_usage WHERE conversation_id = ?
    `).get(conversationId) as { input_tokens: number; output_tokens: number; calls: number }

    return NextResponse.json({
      by_type: rows.map(r => ({ ...r, label: CALL_TYPE_LABELS[r.call_type] || r.call_type })),
      total_input: totals?.input_tokens || 0,
      total_output: totals?.output_tokens || 0,
      total_calls: totals?.calls || 0,
    })
  }

  // Global stats — breakdown by call type
  const byType = db.prepare(`
    SELECT call_type,
           SUM(input_tokens)  AS input_tokens,
           SUM(output_tokens) AS output_tokens,
           COUNT(*)           AS calls
    FROM token_usage
    GROUP BY call_type
    ORDER BY (SUM(input_tokens) + SUM(output_tokens)) DESC
  `).all() as { call_type: string; input_tokens: number; output_tokens: number; calls: number }[]

  const totals = db.prepare(`
    SELECT SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, COUNT(*) AS calls
    FROM token_usage
  `).get() as { input_tokens: number; output_tokens: number; calls: number }

  // Top conversations by token usage
  const topConversations = db.prepare(`
    SELECT t.conversation_id,
           c.customer_name,
           c.customer_phone,
           SUM(t.input_tokens)  AS input_tokens,
           SUM(t.output_tokens) AS output_tokens
    FROM token_usage t
    LEFT JOIN conversations c ON c.id = t.conversation_id
    WHERE t.conversation_id IS NOT NULL
    GROUP BY t.conversation_id
    ORDER BY (SUM(t.input_tokens) + SUM(t.output_tokens)) DESC
    LIMIT 10
  `).all() as { conversation_id: number; customer_name: string | null; customer_phone: string; input_tokens: number; output_tokens: number }[]

  return NextResponse.json({
    by_type: byType.map(r => ({ ...r, label: CALL_TYPE_LABELS[r.call_type] || r.call_type })),
    top_conversations: topConversations,
    total_input: totals?.input_tokens || 0,
    total_output: totals?.output_tokens || 0,
    total_calls: totals?.calls || 0,
  })
}
