'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Send, Languages, ChevronDown, User, Check, CheckCheck, Loader2, ArrowLeft, Menu, BookOpen, FileText, Settings as SettingsIcon, Package, Mail, MessageSquare, Merge, Paperclip } from 'lucide-react'
import OrdersModal from '@/components/OrdersModal'
import MonsterAvatar from '@/components/MonsterAvatar'
import { formatTime, getLanguageName, formatPhone, formatContactName, formatFileSize } from '@/lib/utils'

interface Message {
  id: number
  conversation_id: number
  direction: 'inbound' | 'outbound'
  content: string
  content_dutch: string | null
  content_customer_lang: string | null
  language: string | null
  sent_at: string
  status: string
  reactions: string
  channel?: 'whatsapp' | 'email'
  email_subject?: string | null
  email_html?: string | null
  email_cc?: string | null
  email_attachments?: string | null
  media_url?: string | null
}

interface Conversation {
  id: number
  customer_phone: string | null
  customer_email: string | null
  customer_name: string | null
  detected_language: string
  unread_count: number
}

function EmailCc({ cc }: { cc: Array<{ address: string; name: string }> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="text-[11px] text-whatsapp-muted">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 hover:text-whatsapp-text">
        CC: {cc.length} ontvanger{cc.length > 1 ? 's' : ''}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-0.5 pl-1">
          {cc.map((c, i) => (
            <div key={i}>{c.name ? `${c.name} <${c.address}>` : c.address}</div>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  conversationId: number | null
  onConversationLoad?: (conv: Conversation) => void
  onMessageSent?: () => void
  onChannelChange?: (channel: 'whatsapp' | 'email') => void
  onBack?: () => void
  onOpenSettings?: () => void
  onOpenContext?: () => void
  onOpenKnowledge?: () => void
}

export default function ChatWindow({ conversationId, onConversationLoad, onMessageSent, onChannelChange, onBack, onOpenSettings, onOpenContext, onOpenKnowledge }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(false)
  const [showTranslation, setShowTranslation] = useState<Record<number, boolean>>({})
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [manualText, setManualText] = useState('')
  const [sending, setSending] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showOrders, setShowOrders] = useState(false)
  const [orderCount, setOrderCount] = useState<number>(0)
  const [sendChannel, setSendChannel] = useState<'whatsapp' | 'email'>('whatsapp')
  const [showMerge, setShowMerge] = useState(false)
  const [mergeList, setMergeList] = useState<Conversation[]>([])
  const [mergeSearch, setMergeSearch] = useState('')
  const [merging, setMerging] = useState(false)
  const [mergeConfirmId, setMergeConfirmId] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevMessagesLength = useRef(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const load = useCallback(async () => {
    if (!conversationId) return
    try {
      const res = await fetch(`/api/conversations/${conversationId}`)
      if (!res.ok) return
      const data = await res.json()
      setConversation(data.conversation)
      setMessages(data.messages)
      onConversationLoad?.(data.conversation)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [conversationId, onConversationLoad])

  // Set default channel when conversation changes
  useEffect(() => {
    if (!conversation) return
    let ch: 'whatsapp' | 'email'
    if (conversation.customer_phone && conversation.customer_email) {
      ch = 'whatsapp' // Rubens voorkeur
    } else if (conversation.customer_email) {
      ch = 'email'
    } else {
      ch = 'whatsapp'
    }
    setSendChannel(ch)
    onChannelChange?.(ch)
  }, [conversation?.id])

  useEffect(() => {
    if (!conversationId) return
    setLoading(true)
    setMessages([])
    setConversation(null)
    setOrderCount(0)
    setShowMerge(false)
    load()
    // Fetch order count from DB (no WC API call)
    fetch(`/api/orders?conversation_id=${conversationId}&count=1`)
      .then(r => r.json())
      .then(d => setOrderCount(d.count || 0))
      .catch(() => {})
    const interval = setInterval(load, 3000)
    return () => clearInterval(interval)
  }, [conversationId, load])

  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMessagesLength.current = messages.length
  }, [messages])

  async function saveName() {
    if (!conversation || !nameInput.trim()) return
    await fetch(`/api/conversations/${conversation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_name: nameInput.trim() }),
    })
    setEditingName(false)
    load()
  }

  function toggleTranslation(id: number) {
    setShowTranslation(prev => ({ ...prev, [id]: !prev[id] }))
  }

  async function openMerge() {
    try {
      const res = await fetch('/api/conversations')
      const all: Conversation[] = await res.json()
      setMergeList(all.filter(c => c.id !== conversationId))
      setMergeSearch('')
      setShowMerge(true)
    } catch {}
  }

  async function doMerge(mergeId: number) {
    if (!conversationId || merging) return
    setMerging(true)
    try {
      const res = await fetch('/api/conversations/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_id: conversationId, merge_id: mergeId }),
      })
      if (res.ok) {
        setShowMerge(false)
        setMergeSearch('')
        setMergeConfirmId(null)
        onMessageSent?.()
        await load()
      } else {
        const data = await res.json().catch(() => ({}))
        alert(`Samenvoegen mislukt: ${data.error || 'Onbekende fout'}`)
      }
    } catch (e) {
      alert(`Samenvoegen mislukt: ${e instanceof Error ? e.message : 'Netwerkfout'}`)
    }
    setMerging(false)
  }

  async function sendManual() {
    if (!conversation || !manualText.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversation.id, content: manualText.trim(), channel: sendChannel }),
      })
      if (res.ok) {
        setManualText('')
        onMessageSent?.()
        await load()
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendManual()
    }
  }

  if (!conversationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#222e35]">
        <div className="text-center text-whatsapp-muted">
          <div className="w-20 h-20 rounded-full bg-whatsapp-input flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h2 className="text-whatsapp-text text-lg font-medium mb-1">CS Assistant</h2>
          <p className="text-sm">Selecteer een gesprek om te starten</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#222e35]">
        <div className="text-whatsapp-muted text-sm">Laden...</div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#222e35]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-whatsapp-panel border-b border-whatsapp-border shrink-0">
        {onBack && (
          <button onClick={onBack} className="md:hidden p-1 -ml-1 text-whatsapp-muted hover:text-whatsapp-text transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <MonsterAvatar identifier={conversation?.customer_phone || conversation?.customer_email || ''} size={40} className="shrink-0" />
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                className="bg-whatsapp-input text-whatsapp-text text-sm px-2 py-1 rounded outline-none border border-whatsapp-teal w-48"
              />
              <button onClick={saveName} className="text-whatsapp-teal text-xs hover:underline">Opslaan</button>
              <button onClick={() => setEditingName(false)} className="text-whatsapp-muted text-xs hover:underline">Annuleer</button>
            </div>
          ) : (
            <button
              onClick={() => { setNameInput(conversation?.customer_name || ''); setEditingName(true) }}
              className="text-left group"
            >
              <div className="text-whatsapp-text font-medium text-sm flex items-center gap-1">
                {formatContactName(conversation?.customer_name ?? null, conversation?.customer_phone ?? '', conversation?.customer_email)}
                <User className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
              </div>
            </button>
          )}
          <div className="text-whatsapp-muted text-xs flex items-center gap-1.5 flex-wrap">
            {conversation?.customer_phone && <span>{formatPhone(conversation.customer_phone)}</span>}
            {conversation?.customer_phone && conversation?.customer_email && <span>&middot;</span>}
            {conversation?.customer_email && <span>{conversation.customer_email}</span>}
            <span>&middot;</span>
            <span>{getLanguageName(conversation?.detected_language || 'en')}</span>
            <button
              onClick={() => setShowOrders(true)}
              className="inline-flex items-center gap-1 text-whatsapp-teal hover:underline"
            >
              <Package className="w-3 h-3" />
              <span className="hidden sm:inline">Bestellingen{orderCount > 0 ? ` (${orderCount})` : ''}</span>
            </button>
            <button
              onClick={openMerge}
              className="inline-flex items-center gap-1 text-whatsapp-teal hover:underline"
            >
              <Merge className="w-3 h-3" />
              <span className="hidden sm:inline">Samenvoegen</span>
            </button>
          </div>
        </div>

        {/* Mobile hamburger menu */}
        <div className="md:hidden relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(v => !v)}
            className="p-1.5 text-whatsapp-muted hover:text-whatsapp-text transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-whatsapp-panel border border-whatsapp-border rounded-lg shadow-xl z-50 overflow-hidden">
              {onOpenKnowledge && (
                <button onClick={() => { setShowMenu(false); onOpenKnowledge() }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-whatsapp-text hover:bg-whatsapp-input transition-colors">
                  <BookOpen className="w-4 h-4 text-whatsapp-muted" /> Kennisbank
                </button>
              )}
              {onOpenContext && (
                <button onClick={() => { setShowMenu(false); onOpenContext() }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-whatsapp-text hover:bg-whatsapp-input transition-colors">
                  <FileText className="w-4 h-4 text-whatsapp-muted" /> Context
                </button>
              )}
              {onOpenSettings && (
                <button onClick={() => { setShowMenu(false); onOpenSettings() }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-whatsapp-text hover:bg-whatsapp-input transition-colors">
                  <SettingsIcon className="w-4 h-4 text-whatsapp-muted" /> Instellingen
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-1">
        {messages.length === 0 && (
          <div className="text-center text-whatsapp-muted text-sm py-8">Geen berichten</div>
        )}
        {messages.map((msg, i) => {
          const isInbound = msg.direction === 'inbound'
          const showDate = i === 0 || new Date(messages[i - 1].sent_at).toDateString() !== new Date(msg.sent_at).toDateString()
          const reactions: string[] = (() => { try { return JSON.parse(msg.reactions || '[]') } catch { return [] } })()

          // For outbound messages: show content_customer_lang (what was sent to customer)
          // Fall back to content if not available
          const outboundText = msg.content_customer_lang || msg.content
          // Show Dutch toggle for outbound if different from what was sent
          const outboundHasDutch = !isInbound && msg.content && msg.content !== outboundText

          return (
            <div key={msg.id} className="fade-in">
              {showDate && (
                <div className="flex justify-center my-3">
                  <span className="bg-whatsapp-input text-whatsapp-muted text-xs px-3 py-1 rounded-full">
                    {new Date(msg.sent_at).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                </div>
              )}
              <div className={`flex ${isInbound ? 'justify-start' : 'justify-end'} mb-1`}>
                <div className={`max-w-[70%] min-w-[80px] ${isInbound ? 'bubble-inbound' : 'bubble-outbound'} px-3 py-2 rounded-lg`}>
                  {/* Outbound: show Dutch toggle (internal note for CS) */}
                  {outboundHasDutch && (
                    <div className="mb-1">
                      <button
                        onClick={() => toggleTranslation(msg.id)}
                        className="flex items-center gap-1 text-whatsapp-teal text-[11px] hover:underline mb-1"
                      >
                        <Languages className="w-3 h-3" />
                        {showTranslation[msg.id] ? 'Verstuurd bericht tonen' : 'NL-concept tonen'}
                        <ChevronDown className={`w-3 h-3 transition-transform ${showTranslation[msg.id] ? 'rotate-180' : ''}`} />
                      </button>
                      {showTranslation[msg.id] && (
                        <div className="text-whatsapp-text/80 text-xs bg-black/20 rounded px-2 py-1 mb-1 italic">
                          🇳🇱 {msg.content}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Email header: subject, CC, attachments */}
                  {isInbound && msg.channel === 'email' && (
                    <div className="mb-2 space-y-1.5">
                      {msg.email_subject && (
                        <div className="text-xs font-semibold text-whatsapp-text/90 border-b border-white/10 pb-1">
                          {msg.email_subject}
                        </div>
                      )}
                      {msg.email_cc && (() => {
                        try {
                          const cc = JSON.parse(msg.email_cc) as Array<{ address: string; name: string }>
                          if (cc.length === 0) return null
                          return <EmailCc cc={cc} />
                        } catch { return null }
                      })()}
                      {msg.email_attachments && (() => {
                        try {
                          const atts = JSON.parse(msg.email_attachments) as Array<{ id?: string; filename: string; size: number; contentType: string; allowed: boolean }>
                          if (atts.length === 0) return null
                          return (
                            <div className="flex flex-wrap gap-1 items-center">
                              <Paperclip className="w-3 h-3 text-whatsapp-muted shrink-0" />
                              {atts.map((a, i) => (
                                a.id && a.allowed ? (
                                  <a
                                    key={i}
                                    href={`/api/attachments/${a.id}?type=${encodeURIComponent(a.contentType)}&name=${encodeURIComponent(a.filename)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] px-1.5 py-0.5 rounded bg-black/20 text-[#00a884] hover:text-[#06cf9c] underline cursor-pointer transition-colors"
                                  >
                                    {a.filename} ({formatFileSize(a.size)})
                                  </a>
                                ) : (
                                  <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                                    {a.filename} ({formatFileSize(a.size)})
                                  </span>
                                )
                              ))}
                            </div>
                          )
                        } catch { return null }
                      })()}
                    </div>
                  )}

                  {/* WhatsApp media (images, videos, audio) */}
                  {msg.media_url && (() => {
                    try {
                      const items = JSON.parse(msg.media_url) as Array<{ url: string; contentType: string }>
                      return (
                        <div className="mb-2 space-y-2">
                          {items.map((m, i) => {
                            if (m.contentType.startsWith('image/')) {
                              return <img key={i} src={m.url} alt="Afbeelding" className="max-w-full rounded max-h-64 object-contain" />
                            }
                            if (m.contentType.startsWith('video/')) {
                              return <video key={i} src={m.url} controls className="max-w-full rounded max-h-64" />
                            }
                            if (m.contentType.startsWith('audio/')) {
                              return <audio key={i} src={m.url} controls className="w-full" />
                            }
                            return (
                              <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="text-[#00a884] text-sm underline">
                                📎 Bijlage
                              </a>
                            )
                          })}
                        </div>
                      )
                    } catch { return null }
                  })()}

                  {/* Message content: HTML for emails, plain text for others */}
                  {isInbound && msg.channel === 'email' && msg.email_html ? (
                    <div
                      className="text-whatsapp-text text-sm leading-relaxed break-words email-content"
                      dangerouslySetInnerHTML={{ __html: msg.email_html }}
                    />
                  ) : (
                    <p className="text-whatsapp-text text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {isInbound ? msg.content : outboundText}
                    </p>
                  )}

                  {/* Inbound: dutch translation always shown below message */}
                  {isInbound && msg.content_dutch && msg.content_dutch !== msg.content && (
                    <div className="mt-1.5">
                      <div className="text-whatsapp-text/70 text-xs bg-black/20 rounded px-2 py-1 italic">
                        🇳🇱 {msg.content_dutch}
                      </div>
                    </div>
                  )}

                  <div className={`flex items-center gap-1 mt-1 ${isInbound ? 'justify-start' : 'justify-end'}`}>
                    {msg.channel === 'email' ? (
                      <Mail className="w-2.5 h-2.5 text-whatsapp-muted" />
                    ) : (
                      <MessageSquare className="w-2.5 h-2.5 text-whatsapp-muted" />
                    )}
                    <span className="text-whatsapp-muted text-[10px]">{formatTime(msg.sent_at)}</span>
                    {!isInbound && (
                      msg.status === 'read' ? <CheckCheck className="w-3 h-3 text-blue-400" /> :
                      msg.status === 'delivered' ? <CheckCheck className="w-3 h-3 text-whatsapp-muted" /> :
                      msg.status === 'demo' ? <Check className="w-3 h-3 text-yellow-400" /> :
                      <Check className="w-3 h-3 text-whatsapp-muted" />
                    )}
                  </div>

                  {/* Reactions */}
                  {reactions.length > 0 && (
                    <div className={`flex flex-wrap gap-1 mt-1.5 ${isInbound ? 'justify-start' : 'justify-end'}`}>
                      {reactions.map((emoji, idx) => (
                        <span key={idx} className="text-base leading-none">{emoji}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Manual send input */}
      <div className="px-4 py-3 bg-whatsapp-panel border-t border-whatsapp-border flex items-end gap-2 shrink-0">
        <select
          value={sendChannel}
          onChange={e => { const ch = e.target.value as 'whatsapp' | 'email'; setSendChannel(ch); onChannelChange?.(ch) }}
          className="bg-whatsapp-input text-whatsapp-text text-xs px-2 py-2 rounded-lg border border-whatsapp-border focus:border-whatsapp-teal outline-none shrink-0"
        >
          {conversation?.customer_phone && <option value="whatsapp">WhatsApp</option>}
          {conversation?.customer_email && <option value="email">Email</option>}
        </select>
        <textarea
          ref={inputRef}
          value={manualText}
          onChange={e => setManualText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Typ een bericht..."
          rows={1}
          className="flex-1 bg-whatsapp-input text-whatsapp-text text-sm px-3 py-2 rounded-lg outline-none border border-whatsapp-border focus:border-whatsapp-teal placeholder:text-whatsapp-muted resize-none max-h-32"
          style={{ height: 'auto' }}
          onInput={e => {
            const t = e.currentTarget
            t.style.height = 'auto'
            t.style.height = `${Math.min(t.scrollHeight, 128)}px`
          }}
        />
        <button
          onClick={sendManual}
          disabled={sending || !manualText.trim()}
          className="p-2.5 bg-whatsapp-teal disabled:opacity-40 text-white rounded-full hover:bg-whatsapp-teal/90 transition-colors shrink-0"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>

      {/* Merge modal */}
      {showMerge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-whatsapp-panel border border-whatsapp-border rounded-xl w-[400px] max-h-[60vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-whatsapp-border">
              <h3 className="text-whatsapp-text font-semibold text-sm">Samenvoegen met...</h3>
              <button onClick={() => setShowMerge(false)} className="text-whatsapp-muted hover:text-whatsapp-text">
                <span className="text-lg">&times;</span>
              </button>
            </div>
            <div className="px-4 py-2 border-b border-whatsapp-border">
              <input
                type="text"
                value={mergeSearch}
                onChange={e => setMergeSearch(e.target.value)}
                placeholder="Zoek op naam, telefoon of email..."
                className="w-full bg-whatsapp-input text-whatsapp-text text-sm px-3 py-2 rounded-lg outline-none border border-whatsapp-border focus:border-whatsapp-teal placeholder:text-whatsapp-muted"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {mergeList.length === 0 && (
                <div className="text-whatsapp-muted text-sm text-center py-8">Geen andere conversaties</div>
              )}
              {mergeList.filter(c => {
                if (!mergeSearch.trim()) return true
                const q = mergeSearch.toLowerCase()
                return (c.customer_name || '').toLowerCase().includes(q)
                  || (c.customer_phone || '').toLowerCase().includes(q)
                  || (c.customer_email || '').toLowerCase().includes(q)
              }).map(c => (
                <div key={c.id} className="border-b border-whatsapp-border/30">
                  <button
                    onClick={() => setMergeConfirmId(mergeConfirmId === c.id ? null : c.id)}
                    disabled={merging}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-whatsapp-input transition-colors text-left disabled:opacity-50"
                  >
                    <MonsterAvatar identifier={c.customer_phone || c.customer_email || ''} size={36} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-whatsapp-text text-sm truncate">
                        {formatContactName(c.customer_name, c.customer_phone || '', c.customer_email)}
                      </div>
                      <div className="text-whatsapp-muted text-xs flex items-center gap-1">
                        {c.customer_phone && <MessageSquare className="w-3 h-3" />}
                        {c.customer_email && <Mail className="w-3 h-3" />}
                      </div>
                    </div>
                  </button>
                  {mergeConfirmId === c.id && (
                    <div className="px-4 py-2 bg-whatsapp-input flex items-center justify-between">
                      <span className="text-whatsapp-muted text-xs">Samenvoegen? Dit kan niet ongedaan worden.</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setMergeConfirmId(null)}
                          className="text-xs text-whatsapp-muted hover:text-whatsapp-text px-2 py-1"
                        >
                          Annuleren
                        </button>
                        <button
                          onClick={() => doMerge(c.id)}
                          disabled={merging}
                          className="text-xs bg-whatsapp-teal text-white px-3 py-1 rounded hover:bg-whatsapp-teal/90 disabled:opacity-50"
                        >
                          {merging ? 'Bezig...' : 'Bevestigen'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Orders modal */}
      {showOrders && conversation && (
        <OrdersModal
          conversationId={conversation.id}
          onClose={() => setShowOrders(false)}
          onOrderCountChange={setOrderCount}
        />
      )}
    </div>
  )
}
