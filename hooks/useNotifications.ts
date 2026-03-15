'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

type Permission = 'default' | 'granted' | 'denied'

export function useNotifications() {
  const [permission, setPermission] = useState<Permission>('default')
  const swReg = useRef<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Check current permission
    if ('Notification' in window) {
      setPermission(Notification.permission as Permission)
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        swReg.current = reg
      }).catch(err => {
        console.error('[sw] registration failed:', err)
      })
    }
  }, [])

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    const result = await Notification.requestPermission()
    setPermission(result as Permission)
  }, [])

  const notify = useCallback((title: string, body: string, onClick?: () => void) => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    if (localStorage.getItem('notif-enabled') === '0') return
    if (!document.hidden) return // don't notify when tab is active

    // Use service worker for notification (required for iOS PWA)
    if (swReg.current) {
      swReg.current.showNotification(title, {
        body,
        icon: '/favicon-192x192.png',
        badge: '/favicon-192x192.png',
      })
    } else if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_NOTIFICATION',
        title,
        body,
      })
    } else {
      // Fallback for desktop browsers without SW
      const n = new Notification(title, {
        body,
        icon: '/favicon-192x192.png',
      })
      n.onclick = () => {
        window.focus()
        n.close()
        onClick?.()
      }
    }
  }, [])

  return { permission, requestPermission, notify }
}
