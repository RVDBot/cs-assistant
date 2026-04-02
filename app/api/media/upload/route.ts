import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

const MEDIA_DIR = path.join(
  path.dirname(process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'cs-assistant.db')),
  'media'
)

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // Only allow images and videos
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
    return NextResponse.json({ error: 'Only images and videos allowed' }, { status: 400 })
  }

  // 20MB limit
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })
  }

  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true })
  }

  const ext = extensionFromContentType(file.type)
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  fs.writeFileSync(path.join(MEDIA_DIR, id), buffer)

  return NextResponse.json({ id, contentType: file.type })
}

function extensionFromContentType(ct: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/3gpp': '.3gp',
  }
  return map[ct] || ''
}
