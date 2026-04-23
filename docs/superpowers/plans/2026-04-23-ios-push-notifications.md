# iOS Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver reliable server-pushed Web Push notifications to iPhone + iPad + Mac home-screen PWAs whenever a new inbound WhatsApp or email arrives, so the sole operator is notified regardless of whether the app tab is open or recently used.

**Architecture:** Add a `push_subscriptions` table, a new `lib/push.ts` module that sends VAPID-signed Web Push via the `web-push` npm package, four API routes (`subscribe` / `unsubscribe` / `vapid-public-key` / `test`), a service-worker upgrade with a real `push` handler, a new Settings UI section to manage devices, and a single `sendPushToAllDevices` call at the end of the existing Twilio webhook and IMAP poller. Subscriptions are automatically pruned when the push service returns 404/410. Dutch notification bodies reuse `messages.content_dutch`, which is already populated at ingest — no extra Claude calls.

**Tech Stack:** Next.js 15 (App Router, TS), better-sqlite3, [`web-push`](https://www.npmjs.com/package/web-push) npm package (VAPID / Web Push protocol), existing `lib/logger.ts` for structured logs.

**Testing note:** This repo has no unit-test framework configured. Verification is done via:
1. Compile errors (`npx tsc --noEmit`) after each task
2. Targeted manual curl/HTTP calls against the dev server
3. `POST /api/push/test` — built-in smoke test that sends a dummy push to the caller's own subscription
4. End-to-end manual testing on each device (final task)

**Reference spec:** `docs/superpowers/specs/2026-04-23-ios-push-notifications-design.md`

---

## File structure

**New files:**
- `lib/push.ts` — VAPID config, subscription CRUD, `sendPushToAllDevices`
- `app/api/push/subscribe/route.ts`
- `app/api/push/unsubscribe/route.ts`
- `app/api/push/vapid-public-key/route.ts`
- `app/api/push/list/route.ts`
- `app/api/push/test/route.ts`
- `components/NotificationsSettings.tsx` — UI section (kept separate to keep `Settings.tsx` focused)

**Modified files:**
- `package.json` — add `web-push` + `@types/web-push`
- `.env.example` — add three VAPID env vars
- `lib/db.ts:25-127` — add `push_subscriptions` CREATE TABLE inside `initSchema`
- `lib/logger.ts:4` — extend `LogCategory` union with `'push'`
- `public/sw.js` — add `push` + `pushsubscriptionchange` handlers; extend `notificationclick` to deep-link
- `app/api/twilio/webhook/route.ts:146-153` — call `sendPushToAllDevices` after the INSERT
- `lib/email.ts:449-457` — same in the email flow
- `components/Settings.tsx` — mount `<NotificationsSettings />` in the appropriate panel

---

## Task 1: Install `web-push` and configure VAPID keys

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- New: `.env.local` (local only — not committed; user's existing file)

- [ ] **Step 1.1: Install the `web-push` package**

```bash
cd "/Users/ruben/Library/CloudStorage/ProtonDrive-ruben.vandenbussche@proton.me-folder/_Personal/Claude code/cs-assistant"
npm install web-push
npm install --save-dev @types/web-push
```

Expected: packages added to `dependencies` and `devDependencies` in `package.json`; `package-lock.json` updated.

- [ ] **Step 1.2: Generate VAPID keys**

```bash
npx web-push generate-vapid-keys
```

Expected output: two base64url-encoded strings, e.g.
```
=======================================
Public Key:
BNbxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

Private Key:
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
=======================================
```

Keep this output — the next step uses it.

- [ ] **Step 1.3: Add the three VAPID env vars to `.env.local`**

Append to `.env.local` (or create if missing):

```
# Web Push (VAPID)
VAPID_PUBLIC_KEY=<paste Public Key from step 1.2>
VAPID_PRIVATE_KEY=<paste Private Key from step 1.2>
VAPID_SUBJECT=mailto:ruben@uxrv.nl
```

`VAPID_SUBJECT` must be a `mailto:` URL owned by the sender — Apple's APNs gateway requires it for abuse reporting.

- [ ] **Step 1.4: Add the same keys to `.env.example` (with placeholder values)**

Append to `.env.example`:

```
# Web Push (VAPID) — generate with: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=BNbxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VAPID_PRIVATE_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VAPID_SUBJECT=mailto:you@example.com
```

- [ ] **Step 1.5: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "Add web-push dependency and VAPID env vars"
```

---

## Task 2: Add `push_subscriptions` table and `'push'` log category

**Files:**
- Modify: `lib/db.ts`
- Modify: `lib/logger.ts`

- [ ] **Step 2.1: Add `push_subscriptions` table inside `initSchema`**

Open `lib/db.ts`. Find the big `db.exec(\`...\`)` call inside `initSchema` (starts at line 26). Inside that template string, after the `dismissed_orders` table (around line 126), add:

```sql
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint     TEXT NOT NULL UNIQUE,
      p256dh_key   TEXT NOT NULL,
      auth_key     TEXT NOT NULL,
      device_label TEXT,
      user_agent   TEXT,
      created_at   INTEGER NOT NULL,
      last_used_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_push_subs_endpoint ON push_subscriptions(endpoint);
```

This follows the exact same pattern as the other `CREATE TABLE IF NOT EXISTS` blocks — idempotent, safe to run on existing databases.

- [ ] **Step 2.2: Add a `PushSubscriptionRow` interface to `lib/db.ts`**

After the `ContextLink` interface (around line 339), add:

```typescript
export interface PushSubscriptionRow {
  id: number
  endpoint: string
  p256dh_key: string
  auth_key: string
  device_label: string | null
  user_agent: string | null
  created_at: number
  last_used_at: number | null
}
```

- [ ] **Step 2.3: Extend the `LogCategory` union in `lib/logger.ts`**

Change line 4 from:

```typescript
export type LogCategory = 'bericht' | 'ai' | 'twilio' | 'systeem' | 'media'
```

to:

```typescript
export type LogCategory = 'bericht' | 'ai' | 'twilio' | 'systeem' | 'media' | 'push'
```

- [ ] **Step 2.4: Verify the schema migrates cleanly**

Stop any running dev server, then:

```bash
npm run dev
```

Wait for "Ready in …" in the console. Then, in a new terminal:

```bash
sqlite3 data/cs-assistant.db ".schema push_subscriptions"
```

Expected: prints the CREATE TABLE statement with the 8 columns from step 2.1. If it errors with "no such table", the dev server probably didn't initialise — re-run after confirming the server is up.

- [ ] **Step 2.5: Type-check**

```bash
npx tsc --noEmit
```

Expected: exit 0 (no errors).

- [ ] **Step 2.6: Commit**

```bash
git add lib/db.ts lib/logger.ts
git commit -m "Add push_subscriptions table and 'push' log category"
```

---

## Task 3: Create `lib/push.ts`

**Files:**
- Create: `lib/push.ts`

- [ ] **Step 3.1: Write the full module**

Create `lib/push.ts`:

```typescript
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
```

**Notes on this code:**
- `configure()` is lazy + idempotent — VAPID is set once on first use, so unit-test import doesn't crash without env vars.
- `registerSubscription` is an upsert keyed by endpoint; re-subscribing from the same browser updates the keys rather than duplicating.
- `sendPushToOne` is exported for the `/api/push/test` route which targets a single endpoint.
- `sendPushToAllDevices` runs in parallel via `Promise.all`; push attempts are independent so parallelism is safe.
- Truncating endpoints in log meta avoids bloat — endpoints are ~200 chars.

- [ ] **Step 3.2: Type-check**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3.3: Commit**

```bash
git add lib/push.ts
git commit -m "Add lib/push.ts: VAPID config, subscription CRUD, push sending"
```

---

## Task 4: Create `/api/push/*` routes

**Files:**
- Create: `app/api/push/vapid-public-key/route.ts`
- Create: `app/api/push/subscribe/route.ts`
- Create: `app/api/push/unsubscribe/route.ts`
- Create: `app/api/push/list/route.ts`
- Create: `app/api/push/test/route.ts`

All routes sit behind the existing `middleware.ts` auth gate (the matcher at `middleware.ts:62` catches `/api/push/*`), so no auth code is needed inside the handlers.

- [ ] **Step 4.1: `GET /api/push/vapid-public-key`**

Create `app/api/push/vapid-public-key/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getVapidPublicKey } from '@/lib/push'

export async function GET() {
  try {
    return NextResponse.json({ publicKey: getVapidPublicKey() })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 4.2: `POST /api/push/subscribe`**

Create `app/api/push/subscribe/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { registerSubscription } from '@/lib/push'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const b = body as {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    deviceLabel?: string
  }

  const endpoint = b?.subscription?.endpoint
  const p256dh = b?.subscription?.keys?.p256dh
  const auth = b?.subscription?.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'subscription.endpoint / keys.p256dh / keys.auth verplicht' }, { status: 400 })
  }

  const userAgent = req.headers.get('user-agent') || undefined

  registerSubscription({
    subscription: { endpoint, keys: { p256dh, auth } },
    deviceLabel: b.deviceLabel,
    userAgent,
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4.3: `POST /api/push/unsubscribe`**

Create `app/api/push/unsubscribe/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { removeSubscription } from '@/lib/push'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const endpoint = (body as { endpoint?: string })?.endpoint
  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint verplicht' }, { status: 400 })
  }
  removeSubscription(endpoint)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4.4: `GET /api/push/list`**

Create `app/api/push/list/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { listSubscriptions } from '@/lib/push'

export async function GET() {
  const rows = listSubscriptions()
  // Return only fields needed by the UI; never expose p256dh/auth keys
  return NextResponse.json({
    subscriptions: rows.map(r => ({
      endpoint: r.endpoint,
      deviceLabel: r.device_label,
      userAgent: r.user_agent,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
    })),
  })
}
```

- [ ] **Step 4.5: `POST /api/push/test`**

Create `app/api/push/test/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSubscriptionByEndpoint, sendPushToOne } from '@/lib/push'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const endpoint = (body as { endpoint?: string })?.endpoint
  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint verplicht' }, { status: 400 })
  }

  const row = getSubscriptionByEndpoint(endpoint)
  if (!row) {
    return NextResponse.json({ error: 'Subscription niet gevonden' }, { status: 404 })
  }

  const ok = await sendPushToOne(row, {
    title: 'CS Assistant — test',
    body: 'Als je dit ziet, werken pushmeldingen op dit apparaat.',
    url: '/',
    tag: 'test',
  })

  return NextResponse.json({ ok })
}
```

- [ ] **Step 4.6: Type-check**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4.7: Verify routes are reachable (and protected)**

Start the dev server if it isn't already (`npm run dev`). In a new terminal:

```bash
# Should 307 redirect to /login because we have no auth cookie
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/push/list
```

Expected: `307` (redirect to login).

Then log in through the browser at `http://localhost:3000`, copy the `cs_auth` cookie value from DevTools → Application → Cookies, and:

```bash
curl -sS http://localhost:3000/api/push/vapid-public-key -H "Cookie: cs_auth=<paste>"
```

Expected: `{"publicKey":"BN..."}`.

- [ ] **Step 4.8: Commit**

```bash
git add app/api/push/
git commit -m "Add /api/push/* routes (subscribe, unsubscribe, list, test, vapid-public-key)"
```

---

## Task 5: Upgrade the service worker

**Files:**
- Modify: `public/sw.js`

The existing `SHOW_NOTIFICATION` message handler stays for backwards compatibility with any in-tab notification code.

- [ ] **Step 5.1: Replace `public/sw.js` with the upgraded version**

Overwrite `public/sw.js` with:

```javascript
// Service Worker for CS Assistant PWA notifications

const VAPID_KEY_CACHE = 'cs-assistant-vapid'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// In-tab notifications (legacy): main app can still postMessage to show a local notification
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, url } = event.data
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: '/favicon-192x192.png',
        badge: '/favicon-192x192.png',
        data: { url: url || '/' },
      })
    )
  }
})

// Real server push
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'CS Assistant', body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'CS Assistant', {
      body: data.body || '',
      icon: '/favicon-192x192.png',
      badge: '/favicon-192x192.png',
      tag: data.tag,
      data: { url: data.url || '/' },
      renotify: !!data.tag,
    })
  )
})

// Browser revoked the subscription — ask the server for the VAPID key and re-subscribe
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const resp = await fetch('/api/push/vapid-public-key')
      if (!resp.ok) return
      const { publicKey } = await resp.json()
      const newSub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      await fetch('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ subscription: newSub.toJSON() }),
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (e) {
      // Next successful app open will re-subscribe via the UI
    }
  })())
})

// Notification click → focus/open the PWA on the right conversation
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = clientsList.find(c => c.url.startsWith(self.location.origin))
    if (existing) {
      await existing.focus()
      if ('navigate' in existing) {
        try { await existing.navigate(url) } catch {}
      }
      return
    }
    await self.clients.openWindow(url)
  })())
})

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}
```

**Notes:**
- `urlBase64ToUint8Array` is the canonical helper for converting a base64url VAPID key into the `ArrayBuffer` the Push API expects. We need this in both SW (for re-subscribe) and in the client code (Task 6).
- `renotify: !!data.tag` — only re-alert when we provided a tag, so the test push (tag: 'test') re-notifies and real conversation pushes also re-notify; if someone sends a tagless payload it won't nag.
- On `pushsubscriptionchange` we swallow errors: the next time the user opens the app, the client-side subscribe flow will detect a missing subscription and re-register.

- [ ] **Step 5.2: Reload the service worker in the browser**

In the open browser tab at `http://localhost:3000` (logged in):
1. Open DevTools → Application → Service Workers
2. Click "Unregister" next to the existing SW
3. Hard-refresh (Cmd+Shift+R)
4. Verify in DevTools that the new SW is installed and **activated**, with status "activated and is running"
5. In the **Console** tab, run:
   ```javascript
   navigator.serviceWorker.ready.then(reg => console.log('SW scope:', reg.scope))
   ```
   Expected: logs `SW scope: http://localhost:3000/`.

- [ ] **Step 5.3: Commit**

```bash
git add public/sw.js
git commit -m "Upgrade service worker: add push + pushsubscriptionchange handlers"
```

---

## Task 6: Settings UI — enable/disable notifications per device

**Files:**
- Create: `components/NotificationsSettings.tsx`
- Modify: `components/Settings.tsx`

- [ ] **Step 6.1: Create `components/NotificationsSettings.tsx`**

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { Bell, BellOff, Loader2, Send, Trash2 } from 'lucide-react'

interface DeviceRow {
  endpoint: string
  deviceLabel: string | null
  userAgent: string | null
  createdAt: number
  lastUsedAt: number | null
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function detectDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Unknown'
  const ua = navigator.userAgent
  if (/iPad/.test(ua)) return 'iPad Safari'
  if (/iPhone/.test(ua)) return 'iPhone Safari'
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua)) return 'Mac Safari'
  if (/Macintosh/.test(ua) && /Chrome/.test(ua)) return 'Mac Chrome'
  if (/Windows/.test(ua)) return 'Windows ' + (/Edg\//.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : 'browser')
  return 'Browser'
}

function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false
  // iOS Safari: non-standard but reliable
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true
  // Everything else
  const mmStandalone = window.matchMedia?.('(display-mode: standalone)').matches
  return Boolean(iosStandalone || mmStandalone)
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

export function NotificationsSettings() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null)
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [standalone, setStandalone] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Detect current device's subscription
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        setCurrentEndpoint(sub?.endpoint ?? null)
      } else {
        setCurrentEndpoint(null)
      }
      // Load all registered devices
      const res = await fetch('/api/push/list')
      if (res.ok) {
        const data = await res.json()
        setDevices(data.subscriptions || [])
      }
      setStandalone(isStandalonePWA())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const enable = async () => {
    setBusy(true)
    setError(null)
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Deze browser ondersteunt geen pushmeldingen.')
      }
      if (isIOS() && !isStandalonePWA()) {
        throw new Error('Zet de app eerst op je beginscherm (Deel → Zet op beginscherm) en open hem vanaf daar.')
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        throw new Error('Permissie geweigerd.')
      }

      const keyRes = await fetch('/api/push/vapid-public-key')
      if (!keyRes.ok) throw new Error('VAPID public key ophalen mislukt')
      const { publicKey } = await keyRes.json()

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      const subscribeRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), deviceLabel: detectDeviceLabel() }),
      })
      if (!subscribeRes.ok) throw new Error('Subscribe bij server mislukt')

      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const disableCurrent = async () => {
    setBusy(true)
    setError(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const removeDevice = async (endpoint: string) => {
    setBusy(true)
    setError(null)
    try {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const sendTest = async () => {
    if (!currentEndpoint) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: currentEndpoint }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error('Test-push mislukt — server kon de push niet afleveren.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-text-tertiary text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Laden…
      </div>
    )
  }

  const currentDevice = devices.find(d => d.endpoint === currentEndpoint)
  const otherDevices = devices.filter(d => d.endpoint !== currentEndpoint)
  const needsInstall = isIOS() && !standalone

  return (
    <div className="space-y-4">
      <h3 className="text-text-primary text-sm font-medium flex items-center gap-2">
        <Bell className="w-4 h-4" /> Meldingen
      </h3>

      {error && (
        <div className="text-red-400 text-xs bg-red-500/10 px-3 py-2 rounded-lg">{error}</div>
      )}

      {needsInstall ? (
        <div className="text-text-secondary text-xs bg-surface-2 px-3 py-2 rounded-lg">
          Op iPhone/iPad moet je de app eerst op je beginscherm zetten:
          <br />
          Safari → Delen-knop → <b>Zet op beginscherm</b>. Open de app daarna vanaf het home-screen icoon.
        </div>
      ) : currentDevice ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 bg-surface-2 px-3 py-2 rounded-lg">
            <div className="text-sm text-text-primary">
              <div className="font-medium">{currentDevice.deviceLabel || 'Dit apparaat'}</div>
              <div className="text-xs text-text-tertiary">Ingeschakeld</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={sendTest}
                disabled={busy}
                className="text-xs px-2 py-1 rounded bg-surface-3 hover:bg-surface-4 text-text-primary flex items-center gap-1 disabled:opacity-50"
              >
                <Send className="w-3 h-3" /> Test
              </button>
              <button
                onClick={disableCurrent}
                disabled={busy}
                className="text-xs px-2 py-1 rounded bg-surface-3 hover:bg-surface-4 text-text-primary flex items-center gap-1 disabled:opacity-50"
              >
                <BellOff className="w-3 h-3" /> Uit
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={enable}
          disabled={busy}
          className="w-full text-sm px-3 py-2 rounded-lg bg-accent hover:bg-accent/90 text-white flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
          Meldingen op dit apparaat inschakelen
        </button>
      )}

      {otherDevices.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-text-tertiary font-medium">Andere apparaten</div>
          {otherDevices.map(d => (
            <div key={d.endpoint} className="flex items-center justify-between gap-2 bg-surface-2 px-3 py-2 rounded-lg">
              <div className="text-xs text-text-secondary truncate flex-1">
                {d.deviceLabel || 'Onbekend apparaat'}
              </div>
              <button
                onClick={() => removeDevice(d.endpoint)}
                disabled={busy}
                className="text-xs px-2 py-1 rounded bg-surface-3 hover:bg-surface-4 text-text-tertiary hover:text-red-400 flex items-center gap-1 disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6.2: Mount `NotificationsSettings` in `components/Settings.tsx`**

Open `components/Settings.tsx`. Add the import next to the other component-file imports near the top:

```typescript
import { NotificationsSettings } from './NotificationsSettings'
```

Then locate the logout button. From the project root:

```bash
grep -n "LogOut\b" components/Settings.tsx
```

The matches pinpoint the panel containing the logout control (the `LogOut` icon is imported and used only in that section). Pick the **render site** (the `<LogOut ... />` JSX usage, not the import), and insert the component **above** the button's wrapper so it sits before "Uitloggen":

```tsx
<div className="mb-6">
  <NotificationsSettings />
</div>
```

If the logout button is wrapped in a flex/stack container, add the wrapper as a sibling inside that container so spacing is consistent with neighboring items.

- [ ] **Step 6.3: Type-check**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6.4: Verify the UI renders**

Refresh `http://localhost:3000` in the browser. Open Settings. Confirm the "Meldingen" section appears with either the "Inschakelen" button or (if you're already subscribed from a prior test) the enabled state.

- [ ] **Step 6.5: Commit**

```bash
git add components/NotificationsSettings.tsx components/Settings.tsx
git commit -m "Add NotificationsSettings UI to manage per-device push"
```

---

## Task 7: Trigger push from the Twilio webhook

**Files:**
- Modify: `app/api/twilio/webhook/route.ts`

- [ ] **Step 7.1: Import `sendPushToAllDevices`**

At the top of `app/api/twilio/webhook/route.ts`, add to the existing imports (the block at lines 1–6):

```typescript
import { sendPushToAllDevices } from '@/lib/push'
```

- [ ] **Step 7.2: Send a push after the inbound message is inserted**

Find the INSERT at `app/api/twilio/webhook/route.ts:146-149`:

```typescript
  db.prepare(`
    INSERT INTO messages (conversation_id, direction, content, content_dutch, language, twilio_sid, status, media_url)
    VALUES (?, 'inbound', ?, ?, ?, ?, 'received', ?)
  `).run(conv.id, content, dutchContent, language, messageSid, mediaJson)
```

Immediately after that statement (before the `log('info', 'bericht', ...)` call), insert:

```typescript
  // Fire-and-forget push; failures are logged inside lib/push
  try {
    const convRow = db.prepare('SELECT customer_name FROM conversations WHERE id = ?').get(conv.id) as { customer_name: string | null } | undefined
    const title = convRow?.customer_name || from.replace(/^whatsapp:/, '')
    await sendPushToAllDevices({
      title,
      body: dutchContent.slice(0, 140),
      url: `/?conversation=${conv.id}`,
      tag: `conv-${conv.id}`,
    })
  } catch (e) {
    log('error', 'push', 'Push verzenden na inbound WhatsApp mislukt', { error: e instanceof Error ? e.message : String(e) }, conv.id)
  }
```

**Notes:**
- We await the push so that any per-endpoint failures are captured before the 200 OK response; since subscriptions are few, latency impact is tiny.
- The body is trimmed to 140 chars — enough for a meaningful preview on lock screens without hitting any platform body-size limits.
- `tag: conv-${conv.id}` coalesces repeated pushes for the same conversation on the lock screen.
- The outer `try/catch` is defensive: push failures must never break the inbound message flow. The `log()` call here is independent of per-push logging inside `lib/push.ts`.

- [ ] **Step 7.3: Type-check**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 7.4: Commit**

```bash
git add app/api/twilio/webhook/route.ts
git commit -m "Send push on inbound WhatsApp message"
```

---

## Task 8: Trigger push from the email poller

**Files:**
- Modify: `lib/email.ts`

- [ ] **Step 8.1: Import `sendPushToAllDevices`**

At the top of `lib/email.ts`, add to the existing imports:

```typescript
import { sendPushToAllDevices } from './push'
```

- [ ] **Step 8.2: Send a push after the inbound email is inserted**

Find the INSERT at `lib/email.ts:450-453`:

```typescript
  db.prepare(`
    INSERT INTO messages (conversation_id, direction, content, content_dutch, language, status, channel, email_subject, email_message_id, email_in_reply_to, email_account_id, email_html, email_cc, email_attachments)
    VALUES (?, 'inbound', ?, ?, ?, 'received', 'email', ?, ?, ?, ?, ?, ?, ?)
  `).run(convId, body, dutchContent, language, subject, messageId, inReplyTo || null, account.id, emailHtml, emailCc, emailAttachments)
```

Immediately after that statement (before the `log('info', 'bericht', ...)` call at line 455), insert:

```typescript
  // Push notification
  try {
    const convRow = db.prepare('SELECT customer_name FROM conversations WHERE id = ?').get(convId) as { customer_name: string | null } | undefined
    const title = convRow?.customer_name || fromAddr
    await sendPushToAllDevices({
      title,
      body: dutchContent.slice(0, 140),
      url: `/?conversation=${convId}`,
      tag: `conv-${convId}`,
    })
  } catch (e) {
    log('error', 'push', 'Push verzenden na inbound email mislukt', { error: e instanceof Error ? e.message : String(e) }, convId ?? undefined)
  }
```

- [ ] **Step 8.3: Type-check**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 8.4: Commit**

```bash
git add lib/email.ts
git commit -m "Send push on inbound email"
```

---

## Task 9: End-to-end device testing

No code changes — this task is a manual verification pass. The dev server must be running and reachable at a **public HTTPS URL** (Apple/Google push services refuse localhost). Either deploy to the VPS at this point, or use a Cloudflare Tunnel / ngrok that serves the same origin the PWA is installed at. The PWA must be installed from the same origin that push is served from.

- [ ] **Step 9.1: Deploy to the VPS**

Push the branch and deploy via your existing pipeline (outside the scope of this plan). Confirm `https://<your-domain>/api/push/vapid-public-key` returns the public key when you curl it with a valid auth cookie.

- [ ] **Step 9.2: Mac Safari verification**

1. Open `https://<your-domain>/` in Safari on your Mac and log in
2. Settings → Meldingen → **Inschakelen** → grant permission
3. Click **Test** → a macOS notification should appear within a few seconds
4. **Close the tab entirely**, then from another device send yourself a WhatsApp message on the Twilio number
5. Verify: macOS notification appears even with no cs-assistant tab open

- [ ] **Step 9.3: iPhone verification**

1. Open `https://<your-domain>/` in iPhone Safari and log in
2. Share → **Zet op beginscherm** (add the home-screen icon)
3. Open the app **from the home-screen icon** — it must launch in standalone mode (no Safari UI)
4. Settings → Meldingen → **Inschakelen** → allow iOS permission
5. Tap **Test** — notification should appear (you may need to exit the app first to see it)
6. **Lock the phone**, send yourself a test WhatsApp on the Twilio number from another device
7. Verify: lock-screen notification with customer name and Dutch preview

- [ ] **Step 9.4: iPad verification**

Same as Step 9.3 on iPad Safari.

- [ ] **Step 9.5: Edge cases**

Each of these should behave as described:

- **Rapid pushes from same customer:** send 3 messages within 10s → on the lock screen they appear as a single grouped rerun (via the `tag`), not 3 separate rows.
- **Revoked subscription:** on iPhone, go to iOS Settings → Notifications → CS Assistant → turn off notifications. Send another WhatsApp. Wait ~10s. Check the database: `sqlite3 data/cs-assistant.db "SELECT COUNT(*) FROM push_subscriptions WHERE endpoint LIKE '%apple%'"` — the row for that iPhone should be gone (server received a 410 on the next send). Re-enable from Settings to re-subscribe.
- **Deep link:** tapping a notification opens the PWA on the specific conversation (URL becomes `/?conversation=<id>`). If the main page doesn't yet read that query param, treat that as a small follow-up — the notification still opens the app, just on the default view.

- [ ] **Step 9.6: Final commit (any fixes discovered)**

If end-to-end testing surfaced small issues (wrong label strings, missing query-param handling in `app/page.tsx`, etc.), fix them and commit each fix separately with a descriptive message.
