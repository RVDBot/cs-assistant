// Ondertekend sessietoken voor het inlogcookie. Zonder imports, zodat de tests in
// tests/ dit bestand direct met `node --test` kunnen laden.

const DAY_MS = 24 * 60 * 60 * 1000

/** A session ends after this long without any use of the app. */
export const SESSION_MAX_AGE_MS = 30 * DAY_MS
/** While the app is used, the cookie is re-issued at most once per this interval. */
export const REFRESH_AFTER_MS = DAY_MS

export const AUTH_COOKIE = 'cs_auth'

async function hmacKey(secret: string, usage: 'sign' | 'verify') {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage])
}

export async function signToken(secret: string, issuedAt: number = Date.now()): Promise<string> {
  const payload = `authenticated|${issuedAt}`
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), new TextEncoder().encode(payload))
  return `${payload}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`
}

/** Returns the token's issue time when it is genuine and not expired, otherwise null. */
export async function readToken(token: string, secret: string, now: number = Date.now()): Promise<number | null> {
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return null
    const payload = token.slice(0, dot)
    const issuedAt = parseInt(payload.split('|')[1] ?? '', 10)
    if (Number.isNaN(issuedAt) || now - issuedAt > SESSION_MAX_AGE_MS) return null
    const signature = Uint8Array.from(atob(token.slice(dot + 1)), c => c.charCodeAt(0))
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), signature, new TextEncoder().encode(payload))
    return ok ? issuedAt : null
  } catch {
    return null
  }
}

export function needsRefresh(issuedAt: number, now: number = Date.now()): boolean {
  return now - issuedAt > REFRESH_AFTER_MS
}

export function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS / 1000,
  }
}
