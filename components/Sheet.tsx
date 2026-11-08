'use client'

import { useEffect } from 'react'

// Venster dat op mobiel als bottom sheet van onderen opent en op desktop als
// gecentreerd venster. Alle pop-ups gebruiken dit, zodat ze overal hetzelfde werken.
export default function Sheet({
  onClose,
  children,
  desktopWidth = 'md:w-[580px]',
  closeOnBackdrop = true,
  tall = false,
  zIndex = 'z-50',
}: {
  onClose: () => void
  children: React.ReactNode
  /** Tailwind width class(es) for desktop, e.g. 'md:w-[800px]' */
  desktopWidth?: string
  /** Forms with unsaved input keep this off, so a stray tap doesn't throw work away */
  closeOnBackdrop?: boolean
  /** Use (nearly) the full screen height on mobile, for long content */
  tall?: boolean
  zIndex?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-end md:items-center justify-center bg-black/50 md:bg-black/60 md:p-4`}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className={`sheet-panel w-full ${desktopWidth} bg-surface-1 shadow-lg flex flex-col overflow-hidden
          rounded-t-2xl md:rounded-xl md:border md:border-border
          max-h-[92dvh] md:max-h-[85vh] ${tall ? 'h-[92dvh] md:h-auto' : ''}
          pb-[env(safe-area-inset-bottom)] md:pb-0`}
      >
        {/* Grip so it reads as a sheet on mobile */}
        <div className="md:hidden flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>
        {children}
      </div>
    </div>
  )
}
