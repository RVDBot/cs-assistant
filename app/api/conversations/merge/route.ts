import { NextRequest, NextResponse } from 'next/server'
import { mergeConversations } from '@/lib/email'
import { log } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const { keep_id, merge_id } = await req.json()

  if (!keep_id || !merge_id || keep_id === merge_id) {
    return NextResponse.json({ error: 'Ongeldige conversatie IDs' }, { status: 400 })
  }

  try {
    mergeConversations(keep_id, merge_id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Samenvoegen mislukt'
    log('error', 'systeem', `Samenvoegen mislukt: ${merge_id} → ${keep_id}`, { error })
    return NextResponse.json({ error }, { status: 500 })
  }
}
