import { NextRequest, NextResponse } from 'next/server'
import { addFact, updateFact, deleteFact, KNOWLEDGE_TOPICS } from '@/lib/knowledge'

const isTopic = (t: unknown): t is string => typeof t === 'string' && KNOWLEDGE_TOPICS.some(k => k.slug === t)

export async function POST(req: NextRequest) {
  const { topic, fact } = await req.json()
  if (!isTopic(topic) || typeof fact !== 'string' || !fact.trim()) {
    return NextResponse.json({ error: 'Invalid fields' }, { status: 400 })
  }
  const id = addFact(topic, fact, 'team', null)
  return NextResponse.json({ id })
}

export async function PATCH(req: NextRequest) {
  const { id, fact } = await req.json()
  if (!Number.isInteger(id) || typeof fact !== 'string' || !fact.trim()) {
    return NextResponse.json({ error: 'Invalid fields' }, { status: 400 })
  }
  if (!updateFact(id, fact)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  deleteFact(id)
  return NextResponse.json({ ok: true })
}
