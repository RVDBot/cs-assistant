import { NextResponse } from 'next/server'
import { startWebsiteImport, getImportStatus, getToneDraft, clearToneDraft } from '@/lib/website-import'

export async function GET() {
  return NextResponse.json({ status: getImportStatus(), toneDraft: getToneDraft() })
}

export async function POST() {
  if (!startWebsiteImport()) {
    return NextResponse.json({ error: 'Er loopt al een analyse' }, { status: 409 })
  }
  return NextResponse.json({ status: getImportStatus() })
}

// Concept-tone-of-voice weggooien (na overnemen of verwerpen)
export async function DELETE() {
  clearToneDraft()
  return NextResponse.json({ ok: true })
}
