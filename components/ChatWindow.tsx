'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Send, Languages, ChevronDown, User, Check, CheckCheck, Loader2, ArrowLeft, Menu, BookOpen, FileText, Settings as SettingsIcon } from 'lucide-react'
import { formatTime, getLanguageName, formatPhone, formatContactName } from '@/lib/utils'

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
}

interface Conversation {
  id: number
  customer_phone: string
  customer_name: string | null
  detected_language: string
  unread_count: number
}

interface Props {
  conversationId: number | null
  onConversationLoad?: (conv: Conversation) => void
  onMessageSent?: () => void
  onBack?: () => void
  onOpenSettings?: () => void
  onOpenContext?: () => void
  onOpenKnowledge?: () => void
}

export default function ChatWindow({ conversationId, onConversationLoad, onMessageSent, onBack, onOpenSettings, onOpenContext, onOpenKnowledge }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(false)
  const [showTranslation, setShowTranslation] = useState<Record<number, boolean>>({})
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [manualText, setManualText] = useState('')
  const [sending, setSending] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
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

  useEffect(() => {
    if (!conversationId) return
    setLoading(true)
    setMessages([])
    setConversation(null)
    load()
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

  async function sendManual() {
    if (!conversation || !manualText.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversation.id, content: manualText.trim() }),
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
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0"
          style={{ backgroundColor: '#00a884' }}
        >
          <User className="w-5 h-5" />
        </div>
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
                {formatContactName(conversation?.customer_name ?? null, conversation?.customer_phone ?? '')}
                <User className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
              </div>
            </button>
          )}
          <div className="text-whatsapp-muted text-xs">
            {formatPhone(conversation?.customer_phone || '')} &middot; {getLanguageName(conversation?.detected_language || 'en')}
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

                  <p className="text-whatsapp-text text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {isInbound ? msg.content : outboundText}
                  </p>

                  {/* Inbound: dutch translation always shown below message */}
                  {isInbound && msg.content_dutch && msg.content_dutch !== msg.content && (
                    <div className="mt-1.5">
                      <div className="text-whatsapp-text/70 text-xs bg-black/20 rounded px-2 py-1 italic">
                        🇳🇱 {msg.content_dutch}
                      </div>
                    </div>
                  )}

                  <div className={`flex items-center gap-1 mt-1 ${isInbound ? 'justify-start' : 'justify-end'}`}>
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
    </div>
  )
}
