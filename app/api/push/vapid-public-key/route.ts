import { NextResponse } from 'next/server'
import { getVapidPublicKey } from '@/lib/push'
import { log } from '@/lib/logger'

export async function GET() {
  try {
    return NextResponse.json({ publicKey: getVapidPublicKey() })
  } catch (e) {
    log('error', 'push', 'VAPID public key ophalen mislukt', { error: e instanceof Error ? e.message : String(e) })
    return NextResponse.json(
      { error: 'Push is niet geconfigureerd op de server.' },
      { status: 500 },
    )
  }
}
