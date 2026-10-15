'use client'

import { useState, useEffect } from 'react'
import { X, BookOpen, Save, Loader2, ChevronRight, ArrowLeft, Trash2, Pencil, Plus, Check } from 'lucide-react'

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

interface KnowledgeFact {
  id: number
  fact: string
  source: 'ai' | 'manual' | 'website' | 'team'
  created_at: string
}

const SOURCE_LABELS: Record<KnowledgeFact['source'], string> = {
  ai: 'uit AI-correctie',
  manual: 'uit eigen antwoord',
  website: 'van de website',
  team: 'zelf toegevoegd',
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
  const [facts, setFacts] = useState<KnowledgeFact[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [newFact, setNewFact] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')

  function loadTopics() {
    fetch('/api/knowledge').then(r => r.json()).then(data => {
      setTopics(data.topics || [])
      setCounts(data.factCounts || {})
    })
  }

  useEffect(loadTopics, [])

  async function selectTopic(slug: string) {
    setSelectedSlug(slug)
    setSaved(false)
    const res = await fetch('/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    })
    const data: KnowledgeFile & { facts: KnowledgeFact[] } = await res.json()
    setFile(data)
    setEditContent(data.content)
    setFacts(data.facts || [])
    setEditingId(null)
    setNewFact('')
  }

  async function reloadFacts() {
    if (selectedSlug) await selectTopic(selectedSlug)
    loadTopics()
  }

  async function addFact() {
    if (!selectedSlug || !newFact.trim()) return
    await fetch('/api/knowledge/facts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: selectedSlug, fact: newFact }),
    })
    await reloadFacts()
  }

  async function saveFact(id: number) {
    if (!editText.trim()) return
    await fetch('/api/knowledge/facts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, fact: editText }),
    })
    await reloadFacts()
  }

  async function removeFact(id: number) {
    await fetch('/api/knowledge/facts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await reloadFacts()
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
                De AI leert automatisch van jouw aanpassingen en zelf getypte antwoorden. Wat geleerd is, staat per onderwerp onder &quot;Geleerd&quot;.
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
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {counts[topic.slug] ? (
                    <span className="text-[10px] font-medium bg-accent/15 text-accent rounded-full px-1.5 py-0.5">{counts[topic.slug]}</span>
                  ) : null}
                  <ChevronRight className="w-4 h-4 text-text-tertiary" />
                </div>
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
                {/* Geleerde feiten */}
                <div className="shrink-0 max-h-[50%] overflow-y-auto border-b border-border px-4 py-3 space-y-2">
                  <p className="text-text-tertiary text-xs font-medium">Geleerd ({facts.length})</p>
                  {facts.length === 0 && (
                    <p className="text-text-tertiary text-xs">Nog niets geleerd voor dit onderwerp.</p>
                  )}
                  {facts.map(f => (
                    <div key={f.id} className="group flex items-start gap-2 bg-surface-2 rounded-lg px-3 py-2">
                      {editingId === f.id ? (
                        <>
                          <textarea
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            rows={2}
                            autoFocus
                            className="flex-1 bg-surface-0 text-text-primary text-xs px-2 py-1 rounded outline-none border border-border focus:border-accent resize-none"
                          />
                          <button onClick={() => saveFact(f.id)} className="p-1 text-accent hover:text-accent-hover" title="Opslaan">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-text-tertiary hover:text-text-primary" title="Annuleren">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <p className="text-text-primary text-xs leading-relaxed">{f.fact}</p>
                            <p className="text-text-tertiary text-[10px] mt-0.5">
                              {SOURCE_LABELS[f.source]} · {new Date(f.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('nl-NL')}
                            </p>
                          </div>
                          <button
                            onClick={() => { setEditingId(f.id); setEditText(f.fact) }}
                            className="p-1 text-text-tertiary hover:text-text-primary md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                            title="Bewerken"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => removeFact(f.id)}
                            className="p-1 text-text-tertiary hover:text-danger md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                            title="Verwijderen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                  <div className="flex gap-2 items-center">
                    <input
                      value={newFact}
                      onChange={e => setNewFact(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addFact() }}
                      placeholder="Zelf een feit toevoegen..."
                      className="flex-1 bg-surface-2 text-text-primary text-xs px-3 py-2 rounded-lg outline-none border border-border focus:border-accent placeholder:text-text-tertiary"
                    />
                    <button
                      onClick={addFact}
                      disabled={!newFact.trim()}
                      className="p-2 bg-accent disabled:opacity-40 text-white rounded-lg hover:bg-accent-hover transition-colors"
                      title="Toevoegen"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="shrink-0 text-text-tertiary text-xs font-medium px-4 pt-3">Basistekst</p>
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  className="flex-1 min-h-[160px] bg-surface-0 text-text-primary text-sm p-4 outline-none resize-none font-mono leading-relaxed placeholder:text-text-tertiary"
                  placeholder="Vaste informatie over dit onderwerp in Markdown. De AI past deze tekst niet zelf aan; wat hij leert komt hierboven bij Geleerd."
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
