import { NextRequest, NextResponse } from 'next/server'
import { testAccountConnection } from '@/lib/email'

export async function POST(req: NextRequest) {
  const { accountId } = await req.json()
  if (!accountId) return NextResponse.json({ error: 'Account ID ontbreekt' }, { status: 400 })

  const result = await testAccountConnection(accountId)
  return NextResponse.json(result)
}
