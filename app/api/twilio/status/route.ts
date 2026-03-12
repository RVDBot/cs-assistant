import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { log } from '@/lib/logger'

// Twilio status values in order of progression
const STATUS_RANK: Record<string, number> = {
  accepted: 1, queued: 2, sending: 3, sent: 4,
  delivered: 5, read: 6, failed: 0, undelivered: 0,
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const params = Object.fromEntries(new URLSearchParams(body))

  const messageSid: string = params.MessageSid || ''
  const status: string = (params.MessageStatus || '').toLowerCase()

  if (!messageSid || !status) {
    return new NextResponse('Bad Request', { status: 400 })
  }

  const db = getDb()

  // Only advance status, never go backwards
  const current = db.prepare('SELECT status FROM messages WHERE twilio_sid = ?').get(messageSid) as
    { status: string } | undefined

  if (current) {
    const currentRank = STATUS_RANK[current.status] ?? 0
    const newRank = STATUS_RANK[status] ?? 0
    if (newRank >= currentRank) {
      db.prepare('UPDATE messages SET status = ? WHERE twilio_sid = ?').run(status, messageSid)
      log('info', 'twilio', `Berichtstatus bijgewerkt: ${status}`, { sid: messageSid, prev: current.status })
    }
  }

  return new NextResponse('', { status: 204 })
}
