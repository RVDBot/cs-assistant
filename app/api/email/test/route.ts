import { NextResponse } from 'next/server'
import { testEmailConnection } from '@/lib/email'

export async function POST() {
  const result = await testEmailConnection()
  return NextResponse.json(result)
}
