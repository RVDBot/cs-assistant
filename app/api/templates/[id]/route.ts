import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { validateVariants } from '@/lib/wa-templates'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()

  const template = db.prepare('SELECT * FROM wa_templates WHERE id = ?').get(id) as {
    id: number; name: string; description: string | null; variables: string; created_at: string
  } | undefined

  if (!template) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })

  const variants = db.prepare('SELECT * FROM wa_template_variants WHERE template_id = ?').all(template.id) as {
    id: number; language: string; content_sid: string; preview: string | null
  }[]

  return NextResponse.json({ ...template, variables: JSON.parse(template.variables), variants })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { name, description, variables, variants } = body
  const db = getDb()

  const existing = db.prepare('SELECT id FROM wa_templates WHERE id = ?').get(id)
  if (!existing) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })

  if (variants && Array.isArray(variants)) {
    const variantError = validateVariants(variants)
    if (variantError) return NextResponse.json({ error: variantError }, { status: 400 })
  }

  if (name !== undefined) {
    db.prepare('UPDATE wa_templates SET name = ?, description = ?, variables = ? WHERE id = ?')
      .run(name, description || null, JSON.stringify(variables || []), id)
  }

  if (variants && Array.isArray(variants)) {
    db.prepare('DELETE FROM wa_template_variants WHERE template_id = ?').run(id)
    const insertVariant = db.prepare(
      'INSERT INTO wa_template_variants (template_id, language, content_sid, preview) VALUES (?, ?, ?, ?)'
    )
    for (const v of variants) {
      if (!v.language || !v.content_sid) continue
      insertVariant.run(id, v.language, v.content_sid.trim(), v.preview || null)
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  db.prepare('DELETE FROM wa_templates WHERE id = ?').run(id)
  return NextResponse.json({ ok: true })
}
