import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()
  const templates = db.prepare('SELECT * FROM wa_templates ORDER BY created_at DESC').all() as {
    id: number; name: string; description: string | null; variables: string; created_at: string
  }[]

  const result = templates.map(t => {
    const variants = db.prepare('SELECT * FROM wa_template_variants WHERE template_id = ?').all(t.id) as {
      id: number; language: string; content_sid: string; preview: string | null
    }[]
    return { ...t, variables: JSON.parse(t.variables), variants }
  })

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, description, variables, variants } = body

  if (!name || !variants || !Array.isArray(variants) || variants.length === 0) {
    return NextResponse.json({ error: 'Naam en minimaal 1 taalvariant vereist' }, { status: 400 })
  }

  const db = getDb()

  try {
    const result = db.prepare(
      'INSERT INTO wa_templates (name, description, variables) VALUES (?, ?, ?)'
    ).run(name, description || null, JSON.stringify(variables || []))

    const templateId = result.lastInsertRowid

    const insertVariant = db.prepare(
      'INSERT INTO wa_template_variants (template_id, language, content_sid, preview) VALUES (?, ?, ?, ?)'
    )
    for (const v of variants) {
      if (!v.language || !v.content_sid) continue
      insertVariant.run(templateId, v.language, v.content_sid, v.preview || null)
    }

    return NextResponse.json({ id: templateId })
  } catch (e) {
    if (e instanceof Error && e.message.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Template met deze naam bestaat al' }, { status: 409 })
    }
    throw e
  }
}
