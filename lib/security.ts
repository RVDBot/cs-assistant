import crypto from 'crypto'

// --- Secret validation ---

export function getSecret(): string {
  const secret = (process.env.NEXTAUTH_SECRET || '').trim()
  if (!secret) {
    // Log available env vars starting with NEXT for debugging
    const envKeys = Object.keys(process.env).filter(k => k.startsWith('NEXT') || k === 'NODE_ENV').join(', ')
    throw new Error(`NEXTAUTH_SECRET environment variable is required. Available: [${envKeys}]`)
  }
  if (secret === 'change-me-in-production') {
    throw new Error('NEXTAUTH_SECRET must be changed from the default value')
  }
  return secret
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
