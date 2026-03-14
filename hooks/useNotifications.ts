'use client'

import { useState, useCallback, useEffect } from 'react'

type Permission = 'default' | 'granted' | 'denied'

export function useNotifications() {
  const [permission, setPermission] = useState<Permission>('default')

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission as Permission)
    }
  }, [])

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    const result = await Notification.requestPermission()
    setPermission(result as Permission)
  }, [])

  const notify = useCallback((title: string, body: string, onClick?: () => void) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    if (!document.hidden) return // don't notify when tab is active

    const n = new Notification(title, {
      body,
      icon: '/favicon-192x192.png',
    })
    n.onclick = () => {
      window.focus()
      n.close()
      onClick?.()
    }
  }, [])

  return { permission, requestPermission, notify }
}
