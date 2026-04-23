// Service Worker for CS Assistant PWA notifications

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
      // If the auth cookie expired, middleware redirects to /login (HTML). Detect that
      // explicitly instead of letting resp.json() throw into a silent catch.
      const contentType = resp.headers.get('content-type') || ''
      if (!resp.ok || !contentType.includes('application/json')) {
        // Leave a breadcrumb so the next open of the app can surface it
        const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        clientsList.forEach(c => c.postMessage({ type: 'PUSH_RESUBSCRIBE_FAILED', reason: 'auth-or-network' }))
        return
      }
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
    } catch {
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
