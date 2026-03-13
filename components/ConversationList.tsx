'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Search, MessageCircle, Settings, User, Menu, BookOpen, FileText, X } from 'lucide-react'
import { formatDate, getLanguageName, formatPhone, formatContactName } from '@/lib/utils'

interface Conversation {
  id: number
  customer_phone: string
  customer_name: string | null
  detected_language: string
  updated_at: string
  last_message: string | null
  unread_count: number
}

interface Props {
  selectedId: number | null
  onSelect: (id: number) => void
  onOpenSettings: () => void
  onOpenContext: () => void
  onOpenKnowledge: () => void
}

export default function ConversationList({ selectedId, onSelect, onOpenSettings, onOpenContext, onOpenKnowledge }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations')
      const data = await res.json()
      setConversations(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [load])

  // Close menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = conversations.filter(c => {
    const q = search.toLowerCase()
    return (
      formatContactName(c.customer_name, c.customer_phone).toLowerCase().includes(q) ||
      (c.last_message || '').toLowerCase().includes(q)
    )
  })

  function getAvatarColor(phone: string) {
    const colors = ['#00a884', '#0284c7', '#7c3aed', '#dc2626', '#d97706', '#059669']
    let hash = 0
    for (const c of phone) hash = (hash + c.charCodeAt(0)) % colors.length
    return colors[hash]
  }

  return (
    <div className="flex flex-col h-full w-full md:w-[360px] md:min-w-[300px] border-r border-whatsapp-border bg-whatsapp-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-whatsapp-border">
        <h1 className="text-whatsapp-text font-semibold text-lg">CS Assistant</h1>

        {/* Desktop: individual icon buttons */}
        <div className="hidden md:flex gap-2">
          <button onClick={onOpenKnowledge} className="p-2 rounded-full hover:bg-whatsapp-input text-whatsapp-muted hover:text-whatsapp-text transition-colors" title="Kennisbank">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </button>
          <button onClick={onOpenContext} className="p-2 rounded-full hover:bg-whatsapp-input text-whatsapp-muted hover:text-whatsapp-text transition-colors" title="Context">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
          <button onClick={onOpenSettings} className="p-2 rounded-full hover:bg-whatsapp-input text-whatsapp-muted hover:text-whatsapp-text transition-colors" title="Instellingen">
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile: hamburger menu */}
        <div className="relative md:hidden" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="p-2 rounded-full hover:bg-whatsapp-input text-whatsapp-muted hover:text-whatsapp-text transition-colors"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-whatsapp-panel border border-whatsapp-border rounded-xl shadow-xl z-50 overflow-hidden">
              <button
                onClick={() => { setMenuOpen(false); onOpenKnowledge() }}
                className="w-full flex items-center gap-3 px-4 py-3 text-whatsapp-text text-sm hover:bg-whatsapp-input transition-colors"
              >
                <BookOpen className="w-4 h-4 text-whatsapp-teal" />
                Kennisbank
              </button>
              <button
                onClick={() => { setMenuOpen(false); onOpenContext() }}
                className="w-full flex items-center gap-3 px-4 py-3 text-whatsapp-text text-sm hover:bg-whatsapp-input transition-colors"
              >
                <FileText className="w-4 h-4 text-whatsapp-teal" />
                Context
              </button>
              <button
                onClick={() => { setMenuOpen(false); onOpenSettings() }}
                className="w-full flex items-center gap-3 px-4 py-3 text-whatsapp-text text-sm hover:bg-whatsapp-input transition-colors"
              >
                <Settings className="w-4 h-4 text-whatsapp-teal" />
                Instellingen
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 bg-whatsapp-input rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-whatsapp-muted shrink-0" />
          <input
            type="text"
            placeholder="Zoeken of nieuw gesprek"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-whatsapp-text text-sm w-full outline-none placeholder:text-whatsapp-muted"
          />
        </div>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-20 text-whatsapp-muted text-sm">Laden...</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-whatsapp-muted text-sm gap-2">
            <MessageCircle className="w-10 h-10 opacity-30" />
            <span>Geen gesprekken</span>
            <span className="text-xs opacity-60">Berichten komen binnen via WhatsApp</span>
          </div>
        )}
        {filtered.map(conv => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-whatsapp-input transition-colors border-b border-whatsapp-border/30 text-left ${selectedId === conv.id ? 'bg-whatsapp-input' : ''}`}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: getAvatarColor(conv.customer_phone) }}
            >
              <User className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-whatsapp-text font-medium text-sm truncate">
                  {formatContactName(conv.customer_name, conv.customer_phone)}
                </span>
                <span className="text-whatsapp-muted text-xs shrink-0 ml-2">{formatDate(conv.updated_at)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-whatsapp-muted text-xs truncate">{conv.last_message || 'Nieuw gesprek'}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] text-whatsapp-muted bg-whatsapp-input px-1.5 py-0.5 rounded-full">
                    {getLanguageName(conv.detected_language)}
                  </span>
                  {conv.unread_count > 0 && (
                    <span className="bg-whatsapp-teal text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                      {conv.unread_count > 9 ? '9+' : conv.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
