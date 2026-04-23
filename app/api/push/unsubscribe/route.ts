import { NextRequest, NextResponse } from 'next/server'
import { removeSubscription } from '@/lib/push'

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
  removeSubscription(endpoint)
  return NextResponse.json({ ok: true })
}
