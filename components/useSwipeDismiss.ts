'use client'

import { useEffect, useRef } from 'react'

const CLOSE_DISTANCE = 120 // px dragged down that closes the sheet
const CLOSE_VELOCITY = 0.5 // px/ms flick speed that closes it regardless of distance
const HANDLE_HEIGHT = 72 // px from the top of the panel: grip plus header

/** Nearest scrollable element between the touch target and the panel, if any. */
function scrollParent(el: HTMLElement | null, panel: HTMLElement): HTMLElement | null {
  while (el && el !== panel) {
    const oy = getComputedStyle(el).overflowY
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el
    el = el.parentElement
  }
  return null
}

/**
 * Swipe a bottom sheet down to close it, like a native iOS sheet. A drag starts from
 * anywhere in the panel as long as the content under the finger is scrolled to the top;
 * otherwise the touch scrolls the content as usual. With `handleOnly` (sheets holding
 * forms) a drag only starts from the grip/header strip, so editing can't close it. Mobile only.
 */
export function useSwipeDismiss(onClose: () => void, enabled = true, handleOnly = false) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const panel = panelRef.current
    if (!panel || !enabled) return
    if (!window.matchMedia('(max-width: 767px)').matches) return

    let startY = 0
    let startT = 0
    let dy = 0
    let tracking = false // finger down and allowed to drag
    let dragging = false // actually moving the sheet

    const setOffset = (y: number, animate: boolean) => {
      panel.style.transition = animate ? 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)' : 'none'
      panel.style.transform = y ? `translateY(${y}px)` : ''
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const fromTop = e.touches[0].clientY - panel.getBoundingClientRect().top
      if (handleOnly && fromTop > HANDLE_HEIGHT) { tracking = false; return }
      const scroller = scrollParent(e.target as HTMLElement, panel)
      tracking = !scroller || scroller.scrollTop <= 0
      dragging = false
      startY = e.touches[0].clientY
      startT = e.timeStamp
      dy = 0
    }

    const onMove = (e: TouchEvent) => {
      if (!tracking) return
      dy = e.touches[0].clientY - startY
      if (!dragging) {
        if (dy <= 4) { if (dy < -4) tracking = false; return } // swiping up: let content scroll
        dragging = true
      }
      e.preventDefault() // stop the page/content from bouncing while the sheet moves
      setOffset(Math.max(0, dy), false)
    }

    const onEnd = (e: TouchEvent) => {
      if (!dragging) { tracking = false; return }
      const velocity = dy / Math.max(1, e.timeStamp - startT)
      tracking = dragging = false
      if (dy > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY) {
        setOffset(panel.offsetHeight, true)
        setTimeout(() => closeRef.current(), 200)
      } else {
        setOffset(0, true)
      }
    }

    panel.addEventListener('touchstart', onStart, { passive: true })
    panel.addEventListener('touchmove', onMove, { passive: false })
    panel.addEventListener('touchend', onEnd)
    panel.addEventListener('touchcancel', onEnd)
    return () => {
      panel.removeEventListener('touchstart', onStart)
      panel.removeEventListener('touchmove', onMove)
      panel.removeEventListener('touchend', onEnd)
      panel.removeEventListener('touchcancel', onEnd)
      panel.style.transform = ''
      panel.style.transition = ''
    }
  }, [enabled, handleOnly])

  return panelRef
}
