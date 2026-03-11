'use client'

import { useState, useEffect } from 'react'
import { X, BookOpen, Save, Loader2, ChevronRight } from 'lucide-react'

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-whatsapp-panel border border-whatsapp-border rounded-xl w-[800px] max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-whatsapp-border">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-whatsapp-teal" />
            <h2 className="text-whatsapp-text font-semibold">Kennisbank</h2>
          </div>
          <button onClick={onClose} className="text-whatsapp-muted hover:text-whatsapp-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Topic list */}
          <div className="w-64 border-r border-whatsapp-border overflow-y-auto">
            <div className="p-3">
              <p className="text-whatsapp-muted text-xs px-2 py-1">
                De AI schrijft automatisch in deze bestanden op basis van verzonden antwoorden.
              </p>
            </div>
            {topics.map(topic => (
              <button
                key={topic.slug}
                onClick={() => selectTopic(topic.slug)}
                className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-whatsapp-input transition-colors ${selectedSlug === topic.slug ? 'bg-whatsapp-input border-r-2 border-whatsapp-teal' : ''}`}
              >
                <div className="min-w-0">
                  <p className="text-whatsapp-text text-sm font-medium truncate">{topic.title}</p>
                  <p className="text-whatsapp-muted text-xs truncate">{topic.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-whatsapp-muted shrink-0 ml-2" />
              </button>
            ))}
          </div>

          {/* Editor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selectedSlug ? (
              <div className="flex-1 flex items-center justify-center text-whatsapp-muted">
                <div className="text-center">
                  <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Selecteer een onderwerp</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-whatsapp-border">
                  <div>
                    <h3 className="text-whatsapp-text font-medium text-sm">{file?.title}</h3>
                    {file?.updatedAt && (
                      <p className="text-whatsapp-muted text-xs">
                        Laatst bijgewerkt: {new Date(file.updatedAt).toLocaleString('nl-NL')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={save}
                    disabled={saving || !hasChanges}
                    className="flex items-center gap-1.5 bg-whatsapp-teal disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-whatsapp-teal/90 transition-colors"
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
                  className="flex-1 bg-[#1a2529] text-whatsapp-text text-sm p-4 outline-none resize-none font-mono leading-relaxed placeholder:text-whatsapp-muted"
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
