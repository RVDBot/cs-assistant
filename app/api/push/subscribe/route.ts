import { NextRequest, NextResponse } from 'next/server'
import { registerSubscription } from '@/lib/push'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const b = body as {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    deviceLabel?: string
  }

  const endpoint = b?.subscription?.endpoint
  const p256dh = b?.subscription?.keys?.p256dh
  const auth = b?.subscription?.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'subscription.endpoint / keys.p256dh / keys.auth verplicht' }, { status: 400 })
  }

  const userAgent = req.headers.get('user-agent') || undefined

  registerSubscription({
    subscription: { endpoint, keys: { p256dh, auth } },
    deviceLabel: b.deviceLabel,
    userAgent,
  })

  return NextResponse.json({ ok: true })
}
