import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

const ATTACHMENTS_DIR = path.join(
  path.dirname(process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'cs-assistant.db')),
  'attachments'
)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Prevent path traversal
  if (id.includes('/') || id.includes('\\') || id.includes('..')) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const filePath = path.join(ATTACHMENTS_DIR, id)

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const content = fs.readFileSync(filePath)

  // Determine content type from the query param (passed by frontend)
  const contentType = _req.nextUrl.searchParams.get('type') || 'application/octet-stream'
  const filename = _req.nextUrl.searchParams.get('name') || 'attachment'

  return new NextResponse(content, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': content.length.toString(),
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
