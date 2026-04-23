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
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true
  const mmStandalone = window.matchMedia?.('(display-mode: standalone)').matches
  return Boolean(iosStandalone || mmStandalone)
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return true
  // iPadOS 13+ reports as Macintosh in userAgent; detect via touch support.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
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
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        setCurrentEndpoint(sub?.endpoint ?? null)
      } else {
        setCurrentEndpoint(null)
      }
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
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
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
    <div className="space-y-3">
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
