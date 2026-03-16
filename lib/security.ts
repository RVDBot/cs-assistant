import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

// --- Secret management ---
// Auto-generates and persists a secret to the data volume if not provided via env var.
// This avoids storing secrets in the public repo or docker-compose.

let _cachedSecret: string | null = null

function getSecretFilePath(): string {
  const dbPath = process.env.DATABASE_PATH || './data/cs-assistant.db'
  return path.join(path.dirname(dbPath), '.secret')
}

export function getSecret(): string {
  if (_cachedSecret) return _cachedSecret

  // 1. Check env var first
  const envSecret = (process.env.NEXTAUTH_SECRET || '').trim()
  if (envSecret && envSecret !== 'change-me-in-production') {
    _cachedSecret = envSecret
    return envSecret
  }

  // 2. Try to read from persistent file on data volume
  const secretFile = getSecretFilePath()
  try {
    const fileSecret = fs.readFileSync(secretFile, 'utf-8').trim()
    if (fileSecret) {
      _cachedSecret = fileSecret
      return fileSecret
    }
  } catch {
    // File doesn't exist yet, will generate below
  }

  // 3. Try database
  try {
    const { getDb } = require('./db')
    const db = getDb()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('_auth_secret') as { value: string } | undefined
    if (row?.value) {
      // Also persist to file for middleware edge runtime
      try { fs.writeFileSync(secretFile, row.value, { mode: 0o600 }) } catch {}
      _cachedSecret = row.value
      return row.value
    }
  } catch {}

  // 4. Auto-generate and persist to both file and database
  const generated = crypto.randomBytes(32).toString('base64')
  try {
    const dir = path.dirname(secretFile)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(secretFile, generated, { mode: 0o600 })
  } catch (e) {
    console.error('Warning: could not persist secret to file', e)
  }
  try {
    const { getDb } = require('./db')
    const db = getDb()
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('_auth_secret', generated)
  } catch (e) {
    console.error('Warning: could not persist secret to database', e)
  }

  _cachedSecret = generated
  return generated
}

// --- Password hashing (scrypt) ---

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  // Support legacy plaintext passwords (no colon = not hashed)
  if (!stored.includes(':') || stored.split(':').length !== 2) {
    // Hash both to ensure equal length for timingSafeEqual
    const a = crypto.createHash('sha256').update(password).digest()
    const b = crypto.createHash('sha256').update(stored).digest()
    return crypto.timingSafeEqual(a, b)
  }
  const [salt, hash] = stored.split(':')
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'))
}

// --- Rate limiting (in-memory) ---

const attempts = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = attempts.get(key)

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (entry.count >= maxAttempts) {
    return false
  }

  entry.count++
  return true
}

// --- SSRF protection ---

function isPrivateIP(hostname: string): boolean {
  const patterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^0\./,
    /^\[?::1\]?$/,
    /^\[?fe80:/i,
    /^\[?fc00:/i,
    /^\[?fd/i,
  ]
  return patterns.some(p => p.test(hostname))
}

export function validateExternalUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url)

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, error: 'Only http(s) URLs are allowed' }
    }

    if (isPrivateIP(parsed.hostname)) {
      return { valid: false, error: 'Internal/private URLs are not allowed' }
    }

    if (parsed.port && !['80', '443', ''].includes(parsed.port)) {
      return { valid: false, error: 'Non-standard ports are not allowed' }
    }

    return { valid: true }
  } catch {
    return { valid: false, error: 'Invalid URL' }
  }
}

// --- Twilio webhook signature validation ---

export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string,
): boolean {
  const { getDb } = require('./db')
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('twilio_auth_token') as { value: string } | undefined
  const authToken = row?.value || process.env.TWILIO_AUTH_TOKEN || ''

  if (!authToken) return false

  // Build the data string: URL + sorted params
  let data = url
  const sortedKeys = Object.keys(params).sort()
  for (const key of sortedKeys) {
    data += key + params[key]
  }

  const computed = crypto
    .createHmac('sha1', authToken)
    .update(data)
    .digest('base64')

  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
  } catch {
    return false
  }
}
