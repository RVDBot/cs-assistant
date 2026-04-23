# iOS Push Notifications — Design

**Date:** 2026-04-23
**Status:** Approved by user, ready for implementation planning
**Scope:** Add reliable push notifications to cs-assistant that arrive on iPhone, iPad, and Mac regardless of whether the app tab is open or has been recently used.

---

## Goal

The user (sole operator) gets a home-screen PWA that reliably delivers push notifications on iOS 16.4+, iPadOS 16.4+, and macOS (Safari) whenever a new inbound customer message arrives on any channel (WhatsApp, email).

Currently cs-assistant has a PWA manifest and a service worker, but the service worker only displays notifications that the open app tab sends to it via `postMessage`. When iOS offloads the tab, no notifications fire. This design closes that gap by adding true server-pushed Web Push.

## Non-goals

- Native iOS app / App Store distribution
- Capacitor or WebView wrapper
- Multi-user push (solo use; single operator)
- App-level quiet hours (handled by iOS Focus/DND at the OS level)
- Outbound-message notifications (no "you sent a message" pushes)
- Android — the design works there too, but iOS is the motivator and target

## Design choices already made

| Decision | Choice | Rationale |
| --- | --- | --- |
| Approach | Proper Web Push in the existing PWA (option A of three considered) | Infra is already partially in place; free; keeps everything in one app; iOS 16.4+ Web Push is mature |
| Triggering events | Everything that increments the unread counter (all inbound channels) | User picked "C" — broadest coverage, simplest mental model |
| Notification body | Dutch preview (reused from `messages.content_dutch`) | User picked "C" — operator reads NL; the app already translates at ingest, so no additional Claude call is needed |
| Hosting | VPS with a fixed domain | Subscriptions are origin-bound; a stable domain avoids re-subscribing |
| Target devices | iPhone + iPad + Mac | Requires per-device subscriptions |
| Quiet hours | Not built in the app | iOS Focus/DND silences Web Push system-wide |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Inbound event                                              │
│   • Twilio webhook  (new WhatsApp)                          │
│   • IMAP poller     (new email)                             │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  lib/push.ts  (new)                                         │
│   • Takes customer name + body                              │
│   • Ensures a Dutch translation exists (reuses the          │
│     translation stored at ingest; if absent, creates one)   │
│   • Loads all push_subscriptions from SQLite                │
│   • Signs + sends Web Push via web-push (VAPID)             │
│   • On 404/410: deletes the stale subscription              │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼   (VAPID-signed push, via APNs/FCM)
                     iPhone / iPad / Mac
                           │
                           ▼
                  public/sw.js 'push' handler
                           │
                           ▼
                  Notification appears;
                  tap → opens cs-assistant PWA
                  on the correct conversation
```

### New components

1. SQLite table `push_subscriptions`
2. `lib/push.ts` — sends pushes via the [`web-push`](https://www.npmjs.com/package/web-push) npm package
3. API routes: `/api/push/subscribe`, `/api/push/unsubscribe`, `/api/push/vapid-public-key`, `/api/push/test`
4. Settings UI section: enable/disable per device, list other devices, send test push
5. Service worker upgrade: `push`, `pushsubscriptionchange`, and extended `notificationclick` handlers
6. Calls from Twilio webhook (`app/api/twilio/webhook/route.ts`) and IMAP poller (`lib/email.ts`)
7. VAPID keys, generated once and stored in `.env.local`

### Changes to existing code

- **Twilio webhook handler** (`app/api/twilio/webhook/route.ts`) and **IMAP poller** (`lib/email.ts`) gain a single call to `sendPushToAllDevices` after a new inbound message is persisted.
- **Translation is already done at ingest** today (both handlers call `translateToDutch` before inserting the row and store the result in `messages.content_dutch`). The push path simply reuses that value — no change to the translation flow needed.

---

## Data model

```sql
CREATE TABLE push_subscriptions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint     TEXT NOT NULL UNIQUE,        -- push-service URL from browser
  p256dh_key   TEXT NOT NULL,               -- encryption key (public half)
  auth_key     TEXT NOT NULL,               -- auth secret
  device_label TEXT,                        -- e.g. "iPhone Safari", "Mac Safari"
  user_agent   TEXT,                        -- raw UA, for debugging
  created_at   INTEGER NOT NULL,            -- unix ms
  last_used_at INTEGER                      -- unix ms, updated after each push
);

CREATE INDEX idx_push_subs_endpoint ON push_subscriptions(endpoint);
```

**Field rationale:**
- `endpoint + p256dh_key + auth_key`: minimum required by `web-push`
- `device_label`: shown in Settings so the operator can identify and remove specific devices
- `last_used_at`: enables future cleanup of long-dead subscriptions
- No `user_id` column: single-operator tool. Add later if multi-user becomes relevant.

**Lifecycle:**
- On `/api/push/subscribe`: upsert keyed by `endpoint`
- On `/api/push/unsubscribe`: delete by `endpoint`
- On push send returning HTTP 404 or 410: delete by `endpoint` (browser revoked the subscription)
- On other failures (5xx, timeouts): keep the row (transient)

---

## Backend

### `lib/push.ts` — public API

```typescript
sendPushToAllDevices(params: {
  title: string            // e.g. "Jan de Vries"
  body: string             // Dutch preview, ~120 chars max
  conversationId: string   // for deep-link
  channel: 'whatsapp' | 'email'
}): Promise<void>

registerSubscription(sub: PushSubscriptionJSON, deviceLabel?: string): void
removeSubscription(endpoint: string): void
listSubscriptions(): SubscriptionRow[]
```

### When `sendPushToAllDevices` is called

| Trigger | Location | Addition |
| --- | --- | --- |
| Inbound WhatsApp | `app/api/twilio/webhook/route.ts` | After message is persisted → ensure Dutch preview → call `sendPushToAllDevices` |
| Inbound email | `lib/email.ts` (IMAP poller) | Same pattern |

### API routes (all behind existing login middleware)

```
POST /api/push/subscribe         body: { subscription, deviceLabel }
POST /api/push/unsubscribe       body: { endpoint }
GET  /api/push/vapid-public-key  → { publicKey: "..." }
POST /api/push/test              → sends a dummy push to the caller's endpoint
```

### VAPID keys

- Generate once: `npx web-push generate-vapid-keys`
- Stored in `.env.local` as `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto: address; required by Apple)
- **Never rotate** after go-live without re-subscribing all devices: the subscription endpoints are bound to the public key.

### Push payload (JSON the service worker receives)

```json
{
  "title": "Jan de Vries",
  "body": "Hallo, waar is mijn bestelling?",
  "url": "/?conversation=abc123",
  "tag": "conv-abc123"
}
```

The `tag` field makes repeated pushes for the same conversation coalesce on the lock screen instead of stacking as separate rows.

---

## Frontend

### Service worker (`public/sw.js`) — new handlers

The existing `SHOW_NOTIFICATION` handler stays for backwards compatibility. Added:

```javascript
// Real server push
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'CS Assistant', {
      body: data.body || '',
      icon: '/favicon-192x192.png',
      badge: '/favicon-192x192.png',
      tag: data.tag,
      data: { url: data.url || '/' },
      renotify: true,
    })
  )
})

// Browser revoked subscription → re-register with server
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: /* cached */ })
      .then(sub => fetch('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ subscription: sub.toJSON() }),
        headers: { 'Content-Type': 'application/json' },
      }))
  )
})

// Click → open correct conversation
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find(c => c.url.includes(self.location.origin))
      if (existing) {
        existing.focus()
        return existing.navigate(url)
      }
      return self.clients.openWindow(url)
    })
  )
})
```

### Settings UI — new "Notifications" section

In `components/Settings.tsx`:

**When enabled on this device:**
```
┌─ Notifications ────────────────────────────────────┐
│  This device:  iPhone Safari                       │
│  ● Enabled                        [ Disable ]      │
│                                   [ Send test ]    │
│                                                    │
│  Other devices:                                    │
│   • Mac Safari — enabled             [ remove ]    │
│   • iPad Safari — enabled            [ remove ]    │
└────────────────────────────────────────────────────┘
```

**When not enabled:**
```
┌─ Notifications ────────────────────────────────────┐
│  [ Enable notifications on this device ]           │
│                                                    │
│  Tip: on iPhone/iPad, add this app to your         │
│  home screen first (Share → Add to Home Screen)    │
│  before notifications will work.                   │
└────────────────────────────────────────────────────┘
```

### Subscribe flow (client side)

```
click "Enable"
    ↓
detect if PWA is standalone  →  if not & on iOS: show "install first" guidance
    ↓
GET /api/push/vapid-public-key
    ↓
navigator.serviceWorker.ready
    ↓
registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
    ↓   (iOS shows native permission dialog)
POST /api/push/subscribe  { subscription, deviceLabel: derived from UA }
    ↓
UI refreshes → "Enabled" + "Send test" button appears
```

### iOS 16.4+ constraints enforced by the UI

- PWA must be installed (`display-mode: standalone`) before `Notification.requestPermission()` works → the UI detects this and shows the install instruction instead of the Enable button
- Safari private mode is unsupported → detected and surfaced
- HTTPS-only → VPS already provides TLS

---

## Testing

### Layer 1 — Local / unit
Test `lib/push.ts` with a mock push endpoint:
- VAPID signing produces the expected auth headers
- 404 and 410 responses trigger deletion of that subscription
- 5xx responses do not trigger deletion (transient)

No Jest is configured in the repo today; a runnable `scripts/test-push.ts` using `tsx` is sufficient for manual verification.

### Layer 2 — End-to-end per device (manual, after deploy to VPS)

1. **Mac Safari** (easiest — DevTools visible)
   - Open cs-assistant → Settings → Enable → permission dialog → Send test
   - Verify: notification arrives even with the tab closed

2. **iPhone Safari**
   - Share → Add to Home Screen
   - Open from the home-screen icon (must launch in standalone mode, not Safari)
   - Settings → Enable → iOS permission prompt → Send test
   - With iPhone locked and app backgrounded: push must still arrive

3. **iPad Safari** — same as iPhone

### Layer 3 — Real triggers

- Send a test WhatsApp to the Twilio number → all 3 devices receive a push with the Dutch preview and customer name as title
- Send a test email to the configured IMAP address → same
- Tap the notification on each device → cs-assistant opens on that specific conversation

### Edge cases to verify explicitly

- Rapid pushes for the same conversation coalesce via `tag` (no 5 separate lock-screen rows)
- Device offline during push: Apple/Google buffer for a few days; verify delivery after a brief offline window
- Subscription revoked (iOS Settings → Notifications → off): next push attempt returns 410 → row is deleted from `push_subscriptions`

### Debug endpoint

`POST /api/push/test` sends a dummy push to the caller's own subscription. Essential for diagnosing "my device stopped getting pushes" — lets the operator isolate server vs browser vs device issues.

---

## Open items for the implementation plan

These are not design questions (the design is decided) but implementation details to resolve during planning:

- The app uses idempotent migrations via `CREATE TABLE IF NOT EXISTS` plus `try { ALTER ... } catch {}` in `lib/db.ts` → `initSchema`. The new table follows the same pattern.
- `lib/logger.ts` already provides a `log(level, category, message, meta?, conversationId?)` helper. A new `'push'` log category will be added for push-related events.
- `middleware.ts` matcher already excludes `sw.js` + static assets and gates everything else via the `cs_auth` cookie. `/api/push/*` routes are automatically protected — no middleware changes required. The service worker at `/sw.js` remains publicly accessible (required for PWA).
