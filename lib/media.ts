import path from 'path'
import fs from 'fs'
import { getDb } from './db'

const MEDIA_DIR = path.join(
  path.dirname(process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'cs-assistant.db')),
  'media'
)

function ensureMediaDir() {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true })
  }
}

function getTwilioCredentials() {
  const db = getDb()
  const get = (key: string) =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value || ''
  return {
    accountSid: get('twilio_account_sid') || process.env.TWILIO_ACCOUNT_SID || '',
    authToken: get('twilio_auth_token') || process.env.TWILIO_AUTH_TOKEN || '',
  }
}

/**
 * Download media from a Twilio URL and store locally.
 * Returns the unique file ID.
 */
export async function downloadAndStoreMedia(twilioUrl: string, contentType: string): Promise<string> {
  ensureMediaDir()

  const { accountSid, authToken } = getTwilioCredentials()

  // Twilio media URLs require Basic Auth
  const headers: Record<string, string> = {}
  if (accountSid && authToken) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  }

  const res = await fetch(twilioUrl, { headers, redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  const ext = extensionFromContentType(contentType)
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`

  fs.writeFileSync(path.join(MEDIA_DIR, id), buffer)
  return id
}

/**
 * Migrate existing messages that have Twilio URLs to local storage.
 * Returns count of successfully migrated media items.
 */
export async function migrateExistingMedia(): Promise<{ migrated: number; failed: number }> {
  ensureMediaDir()

  const db = getDb()
  const rows = db.prepare(
    "SELECT id, media_url FROM messages WHERE media_url IS NOT NULL AND media_url LIKE '%api.twilio.com%'"
  ).all() as Array<{ id: number; media_url: string }>

  let migrated = 0
  let failed = 0

  for (const row of rows) {
    try {
      const items = JSON.parse(row.media_url) as Array<{ url?: string; id?: string; contentType: string }>

      // Skip if already migrated (has id instead of url)
      if (items.every(m => m.id && !m.url)) continue

      const newItems: Array<{ id: string; contentType: string }> = []

      for (const item of items) {
        if (item.id && !item.url) {
          // Already migrated
          newItems.push({ id: item.id, contentType: item.contentType })
          continue
        }
        if (!item.url) continue

        try {
          const id = await downloadAndStoreMedia(item.url, item.contentType)
          newItems.push({ id, contentType: item.contentType })
          migrated++
        } catch {
          failed++
          // Keep original URL as fallback
          newItems.push({ id: item.url, contentType: item.contentType })
        }
      }

      db.prepare('UPDATE messages SET media_url = ? WHERE id = ?')
        .run(JSON.stringify(newItems), row.id)
    } catch {
      failed++
    }
  }

  return { migrated, failed }
}

function extensionFromContentType(ct: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/3gpp': '.3gp',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/amr': '.amr',
    'application/pdf': '.pdf',
  }
  return map[ct] || ''
}
