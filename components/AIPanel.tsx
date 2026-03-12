'use client'

import { useState, useCallback, useEffect } from 'react'
import { Sparkles, Send, RefreshCw, Copy, ChevronDown, ChevronUp, Loader2, Languages } from 'lucide-react'
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

interface Props {
  conversation: Conversation | null
  onMessageSent?: () => void
}

export default function AIPanel({ conversation, onMessageSent }: Props) {
  const [answer, setAnswer] = useState<AIAnswer | null>(null)
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [improving, setImproving] = useState(false)
  const [improveInput, setImproveInput] = useState('')
  const [showImprove, setShowImprove] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDutch, setShowDutch] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setAnswer(null)
    setError(null)
    setShowImprove(false)
    setImproveInput('')
  }, [conversation?.id])

  const generate = useCallback(async () => {
    if (!conversation) return
    setGenerating(true)
    setError(null)
    setAnswer(null)
    setShowImprove(false)

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversation.id }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAnswer({ dutch: data.dutch, customerLang: data.customerLang })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fout bij genereren')
    } finally {
      setGenerating(false)
    }
  }, [conversation])

  const improve = useCallback(async () => {
    if (!conversation || !answer || !improveInput.trim()) return
    setImproving(true)
    setError(null)

    try {
      const res = await fetch('/api/ai/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversation.id,
          current_answer: answer.dutch,
          instruction: improveInput,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAnswer({ dutch: data.dutch, customerLang: data.customerLang })
      setImproveInput('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fout bij verbeteren')
    } finally {
      setImproving(false)
    }
  }, [conversation, answer, improveInput])

  const send = useCallback(async () => {
    if (!conversation || !answer) return
    setSending(true)
    setError(null)

    try {
      const res = await fetch('/api/ai/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversation.id,
          answer_dutch: answer.dutch,
          answer_customer_lang: answer.customerLang,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAnswer(null)
      setShowImprove(false)
      onMessageSent?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fout bij versturen')
    } finally {
      setSending(false)
    }
  }, [conversation, answer, onMessageSent])

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

  return (
    <div className="w-[380px] min-w-[320px] flex flex-col bg-whatsapp-panel border-l border-whatsapp-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-whatsapp-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-whatsapp-teal" />
          <h2 className="text-whatsapp-text font-semibold text-sm">AI Assistent</h2>
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
              Genereer antwoord
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
                onClick={() => setShowDutch(true)}
                className={`flex-1 py-1.5 flex items-center justify-center gap-1 transition-colors ${showDutch ? 'bg-whatsapp-teal text-white' : 'text-whatsapp-muted hover:bg-whatsapp-input'}`}
              >
                🇳🇱 Nederlands (CS)
              </button>
              <button
                onClick={() => setShowDutch(false)}
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
                {copied ? <Check className="w-3.5 h-3.5 text-whatsapp-teal" /> : <Copy className="w-3.5 h-3.5" />}
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
                onClick={() => setShowImprove(!showImprove)}
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
                      placeholder="Bv: maak het vriendelijker, voeg retourinstructies toe..."
                      value={improveInput}
                      onChange={e => setImproveInput(e.target.value)}
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

// Missing import
function Check({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}
