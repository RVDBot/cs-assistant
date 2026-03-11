'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Upload, Link, FileText, Trash2, Plus, Loader2, Edit3, Check } from 'lucide-react'

interface ContextFile {
  id: number
  name: string
  file_type: string | null
  created_at: string
}

interface ContextLink {
  id: number
  url: string
  title: string | null
  created_at: string
}

interface Props {
  onClose: () => void
}

export default function ContextManager({ onClose }: Props) {
  const [tab, setTab] = useState<'files' | 'links' | 'tone'>('files')
  const [files, setFiles] = useState<ContextFile[]>([])
  const [links, setLinks] = useState<ContextLink[]>([])
  const [tone, setTone] = useState('')
  const [toneEdited, setToneEdited] = useState('')
  const [loadingUrl, setLoadingUrl] = useState(false)
  const [savingTone, setSavingTone] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadFiles()
    loadLinks()
    loadTone()
  }, [])

  async function loadFiles() {
    const res = await fetch('/api/context/files')
    setFiles(await res.json())
  }

  async function loadLinks() {
    const res = await fetch('/api/context/links')
    setLinks(await res.json())
  }

  async function loadTone() {
    const res = await fetch('/api/context/tone')
    const data = await res.json()
    setTone(data.prompt)
    setToneEdited(data.prompt)
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['txt', 'md', 'pdf', 'csv', 'json'].includes(ext || '')) {
      setError('Ondersteunde bestandstypen: .txt, .md, .pdf, .csv, .json')
      return
    }

    const content = await file.text()
    const res = await fetch('/api/context/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, content, file_type: ext }),
    })

    if (res.ok) {
      await loadFiles()
    } else {
      setError('Upload mislukt')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function deleteFile(id: number) {
    await fetch('/api/context/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await loadFiles()
  }

  async function addLink() {
    if (!urlInput.trim()) return
    setLoadingUrl(true)
    setError(null)
    try {
      const res = await fetch('/api/context/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      })
      if (res.status === 409) {
        setError('Link bestaat al')
      } else if (res.ok) {
        setUrlInput('')
        await loadLinks()
      } else {
        setError('Link toevoegen mislukt')
      }
    } finally {
      setLoadingUrl(false)
    }
  }

  async function deleteLink(id: number) {
    await fetch('/api/context/links', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await loadLinks()
  }

  async function saveTone() {
    setSavingTone(true)
    await fetch('/api/context/tone', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: toneEdited }),
    })
    setTone(toneEdited)
    setSavingTone(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-whatsapp-panel border border-whatsapp-border rounded-xl w-[600px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-whatsapp-border">
          <h2 className="text-whatsapp-text font-semibold">Context Beheren</h2>
          <button onClick={onClose} className="text-whatsapp-muted hover:text-whatsapp-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-whatsapp-border">
          {(['files', 'links', 'tone'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === t ? 'text-whatsapp-teal border-b-2 border-whatsapp-teal' : 'text-whatsapp-muted hover:text-whatsapp-text'}`}
            >
              {t === 'files' ? 'Bestanden' : t === 'links' ? 'Weblinks' : 'Tone of Voice'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-lg px-3 py-2 text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Files tab */}
          {tab === 'files' && (
            <div className="space-y-4">
              <p className="text-whatsapp-muted text-xs">Upload bestanden die de AI als context gebruikt bij het beantwoorden van vragen. (.txt, .md, .csv, .json)</p>
              <input ref={fileInputRef} type="file" accept=".txt,.md,.csv,.json" onChange={uploadFile} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 border-2 border-dashed border-whatsapp-border rounded-lg w-full py-4 text-whatsapp-muted hover:border-whatsapp-teal hover:text-whatsapp-teal transition-colors text-sm justify-center"
              >
                <Upload className="w-4 h-4" />
                Bestand uploaden
              </button>
              <div className="space-y-2">
                {files.length === 0 && <p className="text-whatsapp-muted text-sm text-center py-4">Geen bestanden</p>}
                {files.map(f => (
                  <div key={f.id} className="flex items-center gap-3 bg-whatsapp-input rounded-lg px-3 py-2.5">
                    <FileText className="w-4 h-4 text-whatsapp-teal shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-whatsapp-text text-sm truncate">{f.name}</p>
                      <p className="text-whatsapp-muted text-xs">{new Date(f.created_at).toLocaleDateString('nl-NL')}</p>
                    </div>
                    <button onClick={() => deleteFile(f.id)} className="text-whatsapp-muted hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Links tab */}
          {tab === 'links' && (
            <div className="space-y-4">
              <p className="text-whatsapp-muted text-xs">Voeg weblinks toe. De inhoud wordt opgehaald en gebruikt als context door de AI.</p>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://uw-website.nl/faq"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addLink()}
                  className="flex-1 bg-whatsapp-input text-whatsapp-text text-sm px-3 py-2 rounded-lg outline-none border border-whatsapp-border focus:border-whatsapp-teal placeholder:text-whatsapp-muted"
                />
                <button
                  onClick={addLink}
                  disabled={loadingUrl || !urlInput.trim()}
                  className="flex items-center gap-1 bg-whatsapp-teal disabled:opacity-50 text-white text-sm px-3 py-2 rounded-lg hover:bg-whatsapp-teal/90 transition-colors"
                >
                  {loadingUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>
              <div className="space-y-2">
                {links.length === 0 && <p className="text-whatsapp-muted text-sm text-center py-4">Geen links</p>}
                {links.map(l => (
                  <div key={l.id} className="flex items-center gap-3 bg-whatsapp-input rounded-lg px-3 py-2.5">
                    <Link className="w-4 h-4 text-whatsapp-teal shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-whatsapp-text text-sm truncate">{l.title || l.url}</p>
                      <p className="text-whatsapp-muted text-xs truncate">{l.url}</p>
                    </div>
                    <button onClick={() => deleteLink(l.id)} className="text-whatsapp-muted hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tone tab */}
          {tab === 'tone' && (
            <div className="space-y-4">
              <p className="text-whatsapp-muted text-xs">Beschrijf de gewenste toon en stijl voor AI-antwoorden. Bv: &quot;Vriendelijk en informeel, gebruik &lsquo;je/jij&rsquo;, max 3 alinea&apos;s...&quot;</p>
              <textarea
                value={toneEdited}
                onChange={e => setToneEdited(e.target.value)}
                rows={8}
                placeholder="Schrijf hier de tone-of-voice instructies..."
                className="w-full bg-whatsapp-input text-whatsapp-text text-sm px-3 py-2 rounded-lg outline-none border border-whatsapp-border focus:border-whatsapp-teal placeholder:text-whatsapp-muted resize-none"
              />
              <button
                onClick={saveTone}
                disabled={savingTone || toneEdited === tone}
                className="flex items-center gap-2 bg-whatsapp-teal disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg hover:bg-whatsapp-teal/90 transition-colors"
              >
                {savingTone ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Opslaan
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
