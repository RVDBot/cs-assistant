'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Sparkles, Send, Copy, Loader2, Languages, X, ChevronDown } from 'lucide-react'
import { getLanguageName, LANGUAGE_NAMES } from '@/lib/utils'

interface Conversation {
  id: number
  customer_phone: string | null
  customer_email: string | null
  customer_name: string | null
  detected_language: string
}

interface AIAnswer {
  dutch: string
  customerLang: string
}

interface ConvState {
  answer: AIAnswer | null
  generating: boolean
  improving: boolean
  improveInput: string
  showDutch: boolean
  error: string | null
  tokens: { input: number; output: number } | null
}

function emptyState(): ConvState {
  return {
    answer: null,
    generating: false,
    improving: false,
    improveInput: '',
    showDutch: true,
    error: null,
    tokens: null,
  }
}

interface Props {
  conversation: Conversation | null
  onMessageSent?: () => void
  onClose?: () => void
  sendChannel?: 'whatsapp' | 'email'
  onLanguageChange?: (lang: string) => void
}

export default function AIPanel({ conversation, onMessageSent, onClose, sendChannel, onLanguageChange }: Props) {
  // Per-conversation state cache: keeps answer/state when switching away and back
  const cache = useRef<Record<number, ConvState>>({})
  const convId = conversation?.id ?? null

  const [state, setState] = useState<ConvState>(emptyState)
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)

  // Snapshot latest convId so async callbacks can check if still relevant
  const activeConvId = useRef<number | null>(convId)

  async function fetchTokens(id: number) {
    try {
      const res = await fetch(`/api/token-usage?conversation_id=${id}`)
      const data = await res.json()
      const t = { input: data.total_input || 0, output: data.total_output || 0 }
      if (activeConvId.current === id) {
        patch({ tokens: t })
      } else if (cache.current[id]) {
        cache.current[id] = { ...cache.current[id], tokens: t }
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    // Save current state for the conversation we're leaving
    if (activeConvId.current !== null) {
      cache.current[activeConvId.current] = state
    }
    activeConvId.current = convId

    // Restore state for the conversation we're entering
    if (convId !== null) {
      setState(cache.current[convId] ?? emptyState())
      fetchTokens(convId)
    } else {
      setState(emptyState())
    }
    setSending(false)
    setCopied(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId])

  function patch(updates: Partial<ConvState>) {
    setState(prev => {
      const next = { ...prev, ...updates }
      // Keep cache in sync so the state is correct if we switch away mid-flight
      if (activeConvId.current !== null) {
        cache.current[activeConvId.current] = next
      }
      return next
    })
  }

  const generate = useCallback(async () => {
    if (!conversation) return
    const forConvId = conversation.id
    patch({ generating: true, error: null, answer: null })

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: forConvId }),
      })
      const data = await res.json()
      // Discard if user switched to a different conversation while this was in flight
      if (activeConvId.current !== forConvId) {
        if (cache.current[forConvId]) {
          cache.current[forConvId] = {
            ...cache.current[forConvId],
            generating: false,
            answer: data.error ? null : { dutch: data.dutch, customerLang: data.customerLang },
            error: data.error ?? null,
          }
        }
        return
      }
      if (data.error) throw new Error(data.error)
      patch({ answer: { dutch: data.dutch, customerLang: data.customerLang } })
      fetchTokens(forConvId)
    } catch (e) {
      if (activeConvId.current !== forConvId) return
      patch({ error: e instanceof Error ? e.message : 'Fout bij genereren' })
    } finally {
      if (activeConvId.current === forConvId) {
        patch({ generating: false })
      } else if (cache.current[forConvId]) {
        cache.current[forConvId] = { ...cache.current[forConvId], generating: false }
      }
    }
  }, [conversation])

  const improve = useCallback(async () => {
    if (!conversation || !state.answer || !state.improveInput.trim()) return
    const forConvId = conversation.id
    const currentAnswer = state.answer
    const instruction = state.improveInput
    patch({ improving: true, error: null })

    try {
      const res = await fetch('/api/ai/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: forConvId,
          current_answer: currentAnswer.dutch,
          instruction,
        }),
      })
      const data = await res.json()
      if (activeConvId.current !== forConvId) {
        if (cache.current[forConvId]) {
          cache.current[forConvId] = {
            ...cache.current[forConvId],
            improving: false,
            improveInput: '',
            answer: data.error ? currentAnswer : { dutch: data.dutch, customerLang: data.customerLang },
          }
        }
        return
      }
      if (data.error) throw new Error(data.error)
      patch({ answer: { dutch: data.dutch, customerLang: data.customerLang }, improveInput: '' })
      fetchTokens(forConvId)
    } catch (e) {
      if (activeConvId.current !== forConvId) return
      patch({ error: e instanceof Error ? e.message : 'Fout bij verbeteren' })
    } finally {
      if (activeConvId.current === forConvId) {
        patch({ improving: false })
      } else if (cache.current[forConvId]) {
        cache.current[forConvId] = { ...cache.current[forConvId], improving: false }
      }
    }
  }, [conversation, state.answer, state.improveInput])

  const send = useCallback(async () => {
    if (!conversation || !state.answer) return
    setSending(true)
    patch({ error: null })

    try {
      const res = await fetch('/api/ai/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversation.id,
          answer_dutch: state.answer.dutch,
          answer_customer_lang: state.answer.customerLang,
          channel: sendChannel,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      patch({ answer: null })
      // Clear from cache too so it doesn't restore after send
      if (cache.current[conversation.id]) {
        cache.current[conversation.id] = { ...cache.current[conversation.id], answer: null }
      }
      onMessageSent?.()
    } catch (e) {
      patch({ error: e instanceof Error ? e.message : 'Fout bij versturen' })
    } finally {
      setSending(false)
    }
  }, [conversation, state.answer, onMessageSent, sendChannel])

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!conversation) {
    return (
      <div className="w-[380px] min-w-[320px] flex flex-col items-center justify-center bg-surface-1 border-l border-border">
        <div className="text-center text-text-tertiary px-6">
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Selecteer een gesprek voor AI-hulp</p>
        </div>
      </div>
    )
  }

  const langName = getLanguageName(conversation.detected_language)
  const { answer, generating, improving, improveInput, showDutch, error, tokens } = state

  return (
    <div className="w-[380px] min-w-[320px] flex flex-col min-h-0 bg-surface-1 border-l border-border">
      {/* Token usage */}
      {tokens && (tokens.input > 0 || tokens.output > 0) && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-surface-2 border-b border-border text-[11px] text-text-tertiary">
          <span>Tokens dit gesprek</span>
          <span className="font-mono">{tokens.input.toLocaleString('nl-NL')} in · {tokens.output.toLocaleString('nl-NL')} uit</span>
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            <h2 className="text-text-primary font-semibold text-sm">AI Assistent</h2>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 text-text-tertiary text-xs mt-0.5">
          <span>Klant schrijft in:</span>
          <select
            value={conversation.detected_language}
            onChange={async (e) => {
              const lang = e.target.value
              await fetch(`/api/conversations/${conversation.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ detected_language: lang }),
              })
              onLanguageChange?.(lang)
            }}
            className="bg-transparent text-accent text-xs font-medium cursor-pointer outline-none border-none appearance-none hover:text-accent-hover transition-colors pr-4 relative"
            style={{ backgroundImage: 'none' }}
          >
            {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
              <option key={code} value={code} className="bg-surface-1 text-text-primary">{name}</option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-accent -ml-3.5 pointer-events-none" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-4">

        {/* Generate button */}
        <button
          onClick={generate}
          disabled={generating}
          className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Antwoord genereren...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              {answer ? 'Nieuw antwoord genereren' : 'Genereer antwoord'}
            </>
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="bg-danger-subtle border border-danger/20 rounded-lg px-3 py-2 text-danger text-xs">
            {error}
          </div>
        )}

        {/* Answer */}
        {answer && (
          <div className="space-y-3 fade-in">
            {/* Tab toggle */}
            <div className="flex rounded-lg overflow-hidden border border-border text-xs">
              <button
                onClick={() => patch({ showDutch: true })}
                className={`flex-1 py-1.5 flex items-center justify-center gap-1 transition-colors ${showDutch ? 'bg-accent text-white' : 'text-text-tertiary hover:bg-surface-2'}`}
              >
                🇳🇱 Nederlands (CS)
              </button>
              <button
                onClick={() => patch({ showDutch: false })}
                className={`flex-1 py-1.5 flex items-center justify-center gap-1 transition-colors ${!showDutch ? 'bg-accent text-white' : 'text-text-tertiary hover:bg-surface-2'}`}
              >
                <Languages className="w-3 h-3" />
                {langName} (Klant)
              </button>
            </div>

            {/* Answer text */}
            <div className="bg-surface-2 rounded-lg p-3 relative">
              <p className="text-text-primary text-sm leading-relaxed whitespace-pre-wrap">
                {showDutch ? answer.dutch : answer.customerLang}
              </p>
              <button
                onClick={() => copyToClipboard(showDutch ? answer.dutch : answer.customerLang)}
                className="absolute top-2 right-2 p-1 text-text-tertiary hover:text-text-primary transition-colors"
                title="Kopiëren"
              >
                {copied ? <CheckIcon className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Word-for-word translation label */}
            {!showDutch && (
              <p className="text-text-tertiary text-[11px] px-1">
                ↑ Woord-voor-woord vertaling in {langName} voor de klant
              </p>
            )}

            {/* Improve section */}
            <div className="space-y-1.5">
              <p className="text-text-tertiary text-xs">Antwoord verbeteren</p>
              <div className="flex gap-2 items-end">
                <textarea
                  placeholder="Instructie aan AI, bv: maak het korter..."
                  value={improveInput}
                  onChange={e => patch({ improveInput: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); improve() } }}
                  rows={1}
                  className="flex-1 bg-surface-2 text-text-primary text-xs px-3 py-2 rounded-lg outline-none border border-border focus:border-accent placeholder:text-text-tertiary resize-none max-h-32"
                  onInput={e => {
                    const t = e.currentTarget
                    t.style.height = 'auto'
                    t.style.height = `${Math.min(t.scrollHeight, 128)}px`
                  }}
                />
                <button
                  onClick={improve}
                  disabled={improving || !improveInput.trim()}
                  className="p-2 bg-accent disabled:opacity-40 text-white rounded-lg hover:bg-accent-hover transition-colors shrink-0"
                >
                  {improving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Send button */}
            <button
              onClick={send}
              disabled={sending}
              className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Versturen...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Stuur naar klant ({langName})
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}
