'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Sparkles, Send, RefreshCw, Copy, ChevronDown, ChevronUp, Loader2, Languages, X } from 'lucide-react'
import { getLanguageName } from '@/lib/utils'

interface Conversation {
  id: number
  customer_phone: string
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
  showImprove: boolean
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
    showImprove: false,
    showDutch: true,
    error: null,
    tokens: null,
  }
}

interface Props {
  conversation: Conversation | null
  onMessageSent?: () => void
  onClose?: () => void
}

export default function AIPanel({ conversation, onMessageSent, onClose }: Props) {
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
    patch({ generating: true, error: null, answer: null, showImprove: false })

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
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      patch({ answer: null, showImprove: false })
      // Clear from cache too so it doesn't restore after send
      if (cache.current[conversation.id]) {
        cache.current[conversation.id] = { ...cache.current[conversation.id], answer: null, showImprove: false }
      }
      onMessageSent?.()
    } catch (e) {
      patch({ error: e instanceof Error ? e.message : 'Fout bij versturen' })
    } finally {
      setSending(false)
    }
  }, [conversation, state.answer, onMessageSent])

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!conversation) {
    return (
      <div className="w-[380px] min-w-[320px] flex flex-col items-center justify-center bg-whatsapp-panel border-l border-whatsapp-border">
        <div className="text-center text-whatsapp-muted px-6">
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Selecteer een gesprek voor AI-hulp</p>
        </div>
      </div>
    )
  }

  const langName = getLanguageName(conversation.detected_language)
  const { answer, generating, improving, improveInput, showImprove, showDutch, error, tokens } = state

  return (
    <div className="w-[380px] min-w-[320px] flex flex-col bg-whatsapp-panel border-l border-whatsapp-border">
      {/* Token usage */}
      {tokens && (tokens.input > 0 || tokens.output > 0) && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-whatsapp-input border-b border-whatsapp-border text-[11px] text-whatsapp-muted">
          <span>Tokens dit gesprek</span>
          <span className="font-mono">{tokens.input.toLocaleString('nl-NL')} in · {tokens.output.toLocaleString('nl-NL')} uit</span>
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-3 border-b border-whatsapp-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-whatsapp-teal" />
            <h2 className="text-whatsapp-text font-semibold text-sm">AI Assistent</h2>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-whatsapp-muted hover:text-whatsapp-text transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <p className="text-whatsapp-muted text-xs mt-0.5">
          Klant schrijft in: <span className="text-whatsapp-teal">{langName}</span>
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Generate button */}
        <button
          onClick={generate}
          disabled={generating}
          className="w-full flex items-center justify-center gap-2 bg-whatsapp-teal hover:bg-whatsapp-teal/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
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
          <div className="bg-red-500/20 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* Answer */}
        {answer && (
          <div className="space-y-3 fade-in">
            {/* Tab toggle */}
            <div className="flex rounded-lg overflow-hidden border border-whatsapp-border text-xs">
              <button
                onClick={() => patch({ showDutch: true })}
                className={`flex-1 py-1.5 flex items-center justify-center gap-1 transition-colors ${showDutch ? 'bg-whatsapp-teal text-white' : 'text-whatsapp-muted hover:bg-whatsapp-input'}`}
              >
                🇳🇱 Nederlands (CS)
              </button>
              <button
                onClick={() => patch({ showDutch: false })}
                className={`flex-1 py-1.5 flex items-center justify-center gap-1 transition-colors ${!showDutch ? 'bg-whatsapp-teal text-white' : 'text-whatsapp-muted hover:bg-whatsapp-input'}`}
              >
                <Languages className="w-3 h-3" />
                {langName} (Klant)
              </button>
            </div>

            {/* Answer text */}
            <div className="bg-whatsapp-input rounded-lg p-3 relative">
              <p className="text-whatsapp-text text-sm leading-relaxed whitespace-pre-wrap">
                {showDutch ? answer.dutch : answer.customerLang}
              </p>
              <button
                onClick={() => copyToClipboard(showDutch ? answer.dutch : answer.customerLang)}
                className="absolute top-2 right-2 p-1 text-whatsapp-muted hover:text-whatsapp-text transition-colors"
                title="Kopiëren"
              >
                {copied ? <CheckIcon className="w-3.5 h-3.5 text-whatsapp-teal" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Word-for-word translation label */}
            {!showDutch && (
              <p className="text-whatsapp-muted text-[11px] px-1">
                ↑ Woord-voor-woord vertaling in {langName} voor de klant
              </p>
            )}

            {/* Improve section */}
            <div>
              <button
                onClick={() => patch({ showImprove: !showImprove })}
                className="flex items-center gap-1 text-whatsapp-muted text-xs hover:text-whatsapp-text transition-colors"
              >
                {showImprove ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Antwoord verbeteren
              </button>

              {showImprove && (
                <div className="mt-2 space-y-2 fade-in">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Instructie aan AI, bv: maak het korter, voeg het retouradres toe..."
                      value={improveInput}
                      onChange={e => patch({ improveInput: e.target.value })}
                      onKeyDown={e => e.key === 'Enter' && improve()}
                      className="flex-1 bg-whatsapp-input text-whatsapp-text text-xs px-3 py-2 rounded-lg outline-none border border-whatsapp-border focus:border-whatsapp-teal placeholder:text-whatsapp-muted"
                    />
                    <button
                      onClick={improve}
                      disabled={improving || !improveInput.trim()}
                      className="p-2 bg-whatsapp-teal disabled:opacity-40 text-white rounded-lg hover:bg-whatsapp-teal/90 transition-colors"
                    >
                      {improving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Send button */}
            <button
              onClick={send}
              disabled={sending}
              className="w-full flex items-center justify-center gap-2 bg-whatsapp-teal hover:bg-whatsapp-teal/90 disabled:opacity-50 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
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
