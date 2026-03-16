import { NextRequest, NextResponse } from 'next/server'
import { getAllKnowledgeFiles, getKnowledgeFile, saveKnowledgeFile, KNOWLEDGE_TOPICS } from '@/lib/knowledge'

export async function GET() {
  const files = getAllKnowledgeFiles()
  return NextResponse.json({ files, topics: KNOWLEDGE_TOPICS })
}

export async function PUT(req: NextRequest) {
  const { slug, content } = await req.json()
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 })

  const validSlugs = KNOWLEDGE_TOPICS.map(t => t.slug)
  if (!validSlugs.includes(slug)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  }

  saveKnowledgeFile(slug, content || '')
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const { slug } = await req.json()
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 })

  const validSlugs = KNOWLEDGE_TOPICS.map(t => t.slug)
  if (!validSlugs.includes(slug)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  }

  const file = getKnowledgeFile(slug)
  return NextResponse.json(file)
}
