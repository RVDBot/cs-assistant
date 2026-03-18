'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, ScrollText, RefreshCw, Trash2, Loader2, Search } from 'lucide-react'
import { formatPhone } from '@/lib/utils'

interface LogEntry {
  id: number
  level: string
  category: string
  message: string
  meta: string | null
  created_at: string
  customer_name: string | null
  customer_phone: string | null
}

const LEVEL_STYLES: Record<string, string> = {
  info:  'bg-blue-500/20 text-blue-300',
  warn:  'bg-yellow-500/20 text-yellow-300',
  error: 'bg-red-500/20 text-red-400',
}

const CATEGORY_STYLES: Record<string, string> = {
  bericht: 'text-whatsapp-teal',
  ai:      'text-purple-400',
  twilio:  'text-orange-400',
  systeem: 'text-whatsapp-muted',
}

interface Props {
  onClose: () => void
}

export default function Logs({ onClose }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [level, setLevel] = useState('')
  const [category, setCategory] = useState('')
  const [clearing, setClearing] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return logs
    const q = search.toLowerCase()
    return logs.filter(e =>
      e.message.toLowerCase().includes(q) ||
      (e.customer_name || '').toLowerCase().includes(q) ||
      (e.customer_phone || '').toLowerCase().includes(q) ||
      (e.meta || '').toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q)
    )
  }, [logs, search])

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: '200' })
    if (level) params.set('level', level)
    if (category) params.set('category', category)
    const res = await fetch(`/api/logs?${params}`)
    const data = await res.json()
    setLogs(data.logs || [])
    setLoading(false)
  }, [level, category])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  async function clearLogs() {
    if (!confirm('Alle logs verwijderen?')) return
    setClearing(true)
    await fetch('/api/logs', { method: 'DELETE' })
    setLogs([])
    setClearing(false)
  }

  function formatMeta(meta: string | null) {
    if (!meta) return null
    try {
      return JSON.stringify(JSON.parse(meta), null, 2)
    } catch {
      return meta
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-whatsapp-panel border border-whatsapp-border md:rounded-xl w-full md:w-[820px] h-full md:h-auto md:max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-whatsapp-border">
          <div className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-whatsapp-teal" />
            <h2 className="text-whatsapp-text font-semibold">Activiteitenlog</h2>
            <span className="text-whatsapp-muted text-xs">({logs.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-1.5 text-whatsapp-muted hover:text-whatsapp-text transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={clearLogs} disabled={clearing} className="p-1.5 text-whatsapp-muted hover:text-red-400 transition-colors">
              {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className="p-1.5 text-whatsapp-muted hover:text-whatsapp-text transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-whatsapp-border">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-whatsapp-muted" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Zoeken..."
              className="w-full bg-whatsapp-input text-whatsapp-text text-xs pl-7 pr-2 py-1.5 rounded-lg border border-whatsapp-border outline-none placeholder:text-whatsapp-muted"
            />
          </div>
          <select
            value={level}
            onChange={e => setLevel(e.target.value)}
            className="bg-whatsapp-input text-whatsapp-text text-xs px-2 py-1.5 rounded-lg border border-whatsapp-border outline-none"
          >
            <option value="">Alle niveaus</option>
            <option value="info">Info</option>
            <option value="warn">Waarschuwing</option>
            <option value="error">Fout</option>
          </select>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="bg-whatsapp-input text-whatsapp-text text-xs px-2 py-1.5 rounded-lg border border-whatsapp-border outline-none"
          >
            <option value="">Alle categorieën</option>
            <option value="bericht">Berichten</option>
            <option value="ai">AI</option>
            <option value="twilio">Twilio</option>
            <option value="systeem">Systeem</option>
          </select>
        </div>

        {/* Log list */}
        <div className="flex-1 overflow-y-auto min-h-0 font-mono text-xs">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-whatsapp-muted">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-whatsapp-muted text-sm">
              Geen logs gevonden
            </div>
          ) : (
            filtered.map(entry => (
              <div
                key={entry.id}
                className="border-b border-whatsapp-border/50 hover:bg-whatsapp-input/30 transition-colors"
              >
                <button
                  className="w-full flex flex-col md:flex-row md:items-start gap-1 md:gap-3 px-4 py-2.5 text-left"
                  onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                >
                  {/* Top row on mobile: time + badges */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-whatsapp-muted">
                      {new Date(entry.created_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${LEVEL_STYLES[entry.level] || 'text-whatsapp-muted'}`}>
                      {entry.level}
                    </span>
                    <span className={`${CATEGORY_STYLES[entry.category] || 'text-whatsapp-muted'}`}>
                      {entry.category}
                    </span>
                    {entry.customer_phone && (
                      <span className="text-whatsapp-muted md:hidden ml-auto">
                        {entry.customer_name || formatPhone(entry.customer_phone)}
                      </span>
                    )}
                  </div>
                  {/* Message row */}
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-whatsapp-text truncate flex-1">{entry.message}</span>
                    {entry.customer_phone && (
                      <span className="text-whatsapp-muted hidden md:inline shrink-0 ml-2">
                        {entry.customer_name || formatPhone(entry.customer_phone)}
                      </span>
                    )}
                  </div>
                </button>
                {expanded === entry.id && entry.meta && (
                  <pre className="px-4 pb-3 text-whatsapp-muted whitespace-pre-wrap break-all leading-relaxed">
                    {formatMeta(entry.meta)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
