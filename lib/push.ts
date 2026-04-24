import webpush, { type PushSubscription as WPSub, type SendResult } from 'web-push'
import { getDb, type PushSubscriptionRow } from './db'
import { log } from './logger'

let configured = false

function configure() {
  if (configured) return
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) {
    throw new Error('VAPID env vars niet geconfigureerd (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT)')
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

export function getVapidPublicKey(): string {
  const key = process.env.VAPID_PUBLIC_KEY
  if (!key) throw new Error('VAPID_PUBLIC_KEY niet geconfigureerd')
  return key
}

export interface RegisterInput {
  subscription: {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }
  deviceLabel?: string
  userAgent?: string
}

export function registerSubscription(input: RegisterInput): void {
  const db = getDb()
  const now = Date.now()
  db.prepare(`
    INSERT INTO push_subscriptions (endpoint, p256dh_key, auth_key, device_label, user_agent, created_at, last_used_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(endpoint) DO UPDATE SET
      p256dh_key   = excluded.p256dh_key,
      auth_key     = excluded.auth_key,
      device_label = excluded.device_label,
      user_agent   = excluded.user_agent
  `).run(
    input.subscription.endpoint,
    input.subscription.keys.p256dh,
    input.subscription.keys.auth,
    input.deviceLabel ?? null,
    input.userAgent ?? null,
    now,
  )
  log('info', 'push', 'Push subscription geregistreerd', { deviceLabel: input.deviceLabel })
}

export function removeSubscription(endpoint: string): void {
  const db = getDb()
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint)
}

export function listSubscriptions(): PushSubscriptionRow[] {
  const db = getDb()
  return db.prepare('SELECT * FROM push_subscriptions ORDER BY created_at ASC').all() as PushSubscriptionRow[]
}

export function getSubscriptionByEndpoint(endpoint: string): PushSubscriptionRow | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?').get(endpoint) as PushSubscriptionRow | undefined
}

export interface PushPayload {
  title: string
  body: string
  url: string
  tag?: string
}

/** Sends a push to a single subscription row. Returns true on success; deletes the row on 404/410. */
export async function sendPushToOne(row: PushSubscriptionRow, payload: PushPayload): Promise<boolean> {
  configure()
  const sub: WPSub = {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh_key, auth: row.auth_key },
  }
  try {
    const res: SendResult = await webpush.sendNotification(sub, JSON.stringify(payload))
    const db = getDb()
    db.prepare('UPDATE push_subscriptions SET last_used_at = ? WHERE id = ?').run(Date.now(), row.id)
    return res.statusCode >= 200 && res.statusCode < 300
  } catch (e: unknown) {
    const status = (e as { statusCode?: number })?.statusCode
    if (status === 404 || status === 410) {
      removeSubscription(row.endpoint)
      log('info', 'push', `Verlopen subscription verwijderd (${status})`, { endpoint: row.endpoint.slice(0, 80) })
      return false
    }
    log('error', 'push', 'Push verzenden mislukt', {
      endpoint: row.endpoint.slice(0, 80),
      status,
      error: e instanceof Error ? e.message : String(e),
    })
    return false
  }
}

export interface SendResultSummary {
  total: number
  ok: number
  failed: number
}

export async function sendPushToAllDevices(payload: PushPayload): Promise<SendResultSummary> {
  const rows = listSubscriptions()
  if (rows.length === 0) return { total: 0, ok: 0, failed: 0 }

  const results = await Promise.all(rows.map(r => sendPushToOne(r, payload)))
  const ok = results.filter(Boolean).length
  return { total: rows.length, ok, failed: rows.length - ok }
}
// auto-deploy smoke test: 2026-04-24 10:19:47
