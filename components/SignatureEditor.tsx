'use client'

import { useRef, useState } from 'react'
import { Code, Eye } from 'lucide-react'

// Opgemaakt veld waarin je een handtekening kunt plakken zoals je hem ziet. Het veld
// is een iframe met sandbox zonder 'allow-scripts': geplakte scripts of onerror-
// attributen draaien niet. 'allow-same-origin' laat deze component de inhoud lezen.
export default function SignatureEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const [mode, setMode] = useState<'visual' | 'html'>('visual')
  // Remount the iframe only when switching modes, so typing doesn't reset the cursor
  const [frameKey, setFrameKey] = useState(0)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const initial = useRef(value)

  function attach() {
    const frame = frameRef.current
    const doc = frame?.contentDocument
    if (!frame || !doc) return
    doc.designMode = 'on'
    const resize = () => { frame.style.height = `${Math.max(96, doc.documentElement.scrollHeight)}px` }
    const emit = () => {
      const html = doc.body.innerHTML.trim()
      onChange(html === '<br>' ? '' : html)
      resize()
    }
    doc.addEventListener('input', emit)
    resize()
  }

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:10px;font-family:Arial,sans-serif;font-size:14px;color:#111;background:#fff;min-height:70px;outline:none}
    body:empty:before{content:'Plak hier je handtekening (Cmd+V)';color:#999}
    img{max-width:100%}
  </style></head><body>${initial.current}</body></html>`

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-text-tertiary text-xs font-medium">Handtekening</span>
        <button
          type="button"
          onClick={() => { initial.current = value; setMode(m => (m === 'visual' ? 'html' : 'visual')); setFrameKey(k => k + 1) }}
          className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary"
        >
          {mode === 'visual' ? <><Code className="w-3 h-3" /> HTML bewerken</> : <><Eye className="w-3 h-3" /> Opgemaakt bewerken</>}
        </button>
      </div>
      {mode === 'visual' ? (
        <iframe
          key={frameKey}
          ref={frameRef}
          title="Handtekening"
          sandbox="allow-same-origin"
          srcDoc={srcDoc}
          onLoad={attach}
          className="w-full rounded-lg border border-border bg-white"
          style={{ height: 96 }}
        />
      ) : (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={6}
          spellCheck={false}
          className="w-full bg-surface-2 text-text-primary text-xs font-mono px-3 py-2 rounded-lg outline-none border border-border focus:border-accent"
        />
      )}
      <p className="text-text-tertiary text-xs">
        Kopieer je handtekening uit Gmail, Outlook of een generator en plak hem hierboven; opmaak, links en afbeeldingen blijven behouden. Hij komt onder elke mail vanaf dit account.
      </p>
    </div>
  )
}
