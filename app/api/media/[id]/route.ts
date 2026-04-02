import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

const MEDIA_DIR = path.join(
  path.dirname(process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'cs-assistant.db')),
  'media'
)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Prevent path traversal
  if (id.includes('/') || id.includes('\\') || id.includes('..')) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const filePath = path.join(MEDIA_DIR, id)

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const content = fs.readFileSync(filePath)
  const contentType = _req.nextUrl.searchParams.get('type') || 'application/octet-stream'

  return new NextResponse(content, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
