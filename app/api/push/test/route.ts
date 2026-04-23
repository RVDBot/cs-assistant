import { NextRequest, NextResponse } from 'next/server'
import { getSubscriptionByEndpoint, sendPushToOne } from '@/lib/push'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const endpoint = (body as { endpoint?: string })?.endpoint
  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint verplicht' }, { status: 400 })
  }

  const row = getSubscriptionByEndpoint(endpoint)
  if (!row) {
    return NextResponse.json({ error: 'Subscription niet gevonden' }, { status: 404 })
  }

  const ok = await sendPushToOne(row, {
    title: 'CS Assistant — test',
    body: 'Als je dit ziet, werken pushmeldingen op dit apparaat.',
    url: '/',
    tag: 'test',
  })

  return NextResponse.json({ ok })
}
