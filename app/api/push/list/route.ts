import { NextResponse } from 'next/server'
import { listSubscriptions } from '@/lib/push'

export async function GET() {
  const rows = listSubscriptions()
  return NextResponse.json({
    subscriptions: rows.map(r => ({
      endpoint: r.endpoint,
      deviceLabel: r.device_label,
      userAgent: r.user_agent,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
    })),
  })
}
