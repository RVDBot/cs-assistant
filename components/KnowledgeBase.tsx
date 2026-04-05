'use client'

import { useState, useEffect } from 'react'
import { X, BookOpen, Save, Loader2, ChevronRight, ArrowLeft } from 'lucide-react'

interface KnowledgeTopic {
  slug: string
  title: string
  description: string
}

interface KnowledgeFile {
  slug: string
  title: string
  content: string
  updatedAt: string
}

interface Props {
  onClose: () => void
}

export default function KnowledgeBase({ onClose }: Props) {
  const [topics, setTopics] = useState<KnowledgeTopic[]>([])
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [file, setFile] = useState<KnowledgeFile | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/knowledge').then(r => r.json()).then(data => {
      setTopics(data.topics || [])
    })
  }, [])

  async function selectTopic(slug: string) {
    setSelectedSlug(slug)
    setSaved(false)
    const res = await fetch('/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    })
    const data: KnowledgeFile = await res.json()
    setFile(data)
    setEditContent(data.content)
  }

  async function save() {
    if (!selectedSlug) return
    setSaving(true)
    await fetch('/api/knowledge', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: selectedSlug, content: editContent }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const hasChanges = file && editContent !== file.content

  // On mobile: 'list' shows topics, 'detail' shows editor
  const mobileShowDetail = !!selectedSlug

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface-1 border border-border md:rounded-xl w-full md:w-[800px] h-full md:h-auto md:max-h-[85vh] flex flex-col shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            {/* Mobile: back button when in detail view */}
            {mobileShowDetail && (
              <button
                onClick={() => setSelectedSlug(null)}
                className="md:hidden p-1 -ml-1 mr-1 text-text-tertiary hover:text-text-primary transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <BookOpen className="w-5 h-5 text-accent" />
            <h2 className="text-text-primary font-semibold">
              {mobileShowDetail && file ? <span className="md:hidden">{file.title}</span> : null}
              <span className={mobileShowDetail ? 'hidden md:inline' : ''}>Kennisbank</span>
            </h2>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Topic list — full width on mobile when no topic selected, sidebar on desktop */}
          <div className={`${mobileShowDetail ? 'hidden' : 'flex'} md:flex flex-col w-full md:w-64 border-r border-border overflow-y-auto`}>
            <div className="p-3">
              <p className="text-text-tertiary text-xs px-2 py-1">
                De AI schrijft automatisch in deze bestanden op basis van verzonden antwoorden.
              </p>
            </div>
            {topics.map(topic => (
              <button
                key={topic.slug}
                onClick={() => selectTopic(topic.slug)}
                className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-2 transition-colors ${selectedSlug === topic.slug ? 'bg-surface-2 border-r-2 border-accent' : ''}`}
              >
                <div className="min-w-0">
                  <p className="text-text-primary text-sm font-medium truncate">{topic.title}</p>
                  <p className="text-text-tertiary text-xs truncate">{topic.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0 ml-2" />
              </button>
            ))}
          </div>

          {/* Editor — full width on mobile when topic selected, flex-1 on desktop */}
          <div className={`${mobileShowDetail ? 'flex' : 'hidden'} md:flex flex-1 flex-col overflow-hidden`}>
            {!selectedSlug ? (
              <div className="flex-1 flex items-center justify-center text-text-tertiary">
                <div className="text-center">
                  <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Selecteer een onderwerp</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                  <div>
                    <h3 className="hidden md:block text-text-primary font-medium text-sm">{file?.title}</h3>
                    {file?.updatedAt && (
                      <p className="text-text-tertiary text-xs">
                        Bijgewerkt: {new Date(file.updatedAt).toLocaleString('nl-NL')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={save}
                    disabled={saving || !hasChanges}
                    className="flex items-center gap-1.5 bg-accent disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-accent-hover transition-colors"
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : saved ? (
                      <span>✓ Opgeslagen</span>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        Opslaan
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="flex-1 bg-surface-0 text-text-primary text-sm p-4 outline-none resize-none font-mono leading-relaxed placeholder:text-text-tertiary"
                  placeholder="Dit bestand is leeg. De AI schrijft hier automatisch in zodra er relevante gesprekken zijn gevoerd. Je kunt ook handmatig informatie toevoegen in Markdown-formaat."
                  spellCheck={false}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
