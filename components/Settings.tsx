'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Save, Loader2, Eye, EyeOff, ExternalLink, LogOut } from 'lucide-react'

const CLAUDE_MODELS = [
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Meest capabel)' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Snel & capabel)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Snelst & goedkoopst)' },
]

function Field({ label, id, value, onChange, show, onToggle, placeholder }: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  show?: boolean
  onToggle?: () => void
  placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-whatsapp-muted text-xs font-medium">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={onToggle ? (show ? 'text' : 'password') : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-whatsapp-input text-whatsapp-text text-sm px-3 py-2 rounded-lg outline-none border border-whatsapp-border focus:border-whatsapp-teal placeholder:text-whatsapp-muted pr-10"
        />
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-whatsapp-muted hover:text-whatsapp-text"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  )
}

interface Props {
  onClose: () => void
}

export default function Settings({ onClose }: Props) {
  const [settings, setSettings] = useState({
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_phone_number: '',
    anthropic_api_key: '',
    claude_model: 'claude-opus-4-6',
    app_password: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const router = useRouter()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/twilio/webhook`)
    }
    fetch('/api/settings').then(r => r.json()).then(data => {
      setSettings(prev => ({ ...prev, ...data }))
      setLoading(false)
    })
  }, [])

  async function save() {
    setSaving(true)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-whatsapp-panel border border-whatsapp-border rounded-xl w-[520px] max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-whatsapp-border">
          <h2 className="text-whatsapp-text font-semibold">Instellingen</h2>
          <button onClick={onClose} className="text-whatsapp-muted hover:text-whatsapp-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-whatsapp-teal" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Twilio */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-whatsapp-text font-medium text-sm">Twilio WhatsApp</h3>
                <a
                  href="https://console.twilio.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-whatsapp-teal text-xs hover:underline"
                >
                  Twilio Console <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <Field
                label="Account SID"
                id="twilio_sid"
                value={settings.twilio_account_sid}
                onChange={v => setSettings(p => ({ ...p, twilio_account_sid: v }))}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <Field
                label="Auth Token"
                id="twilio_token"
                value={settings.twilio_auth_token}
                onChange={v => setSettings(p => ({ ...p, twilio_auth_token: v }))}
                show={showToken}
                onToggle={() => setShowToken(!showToken)}
              />
              <Field
                label="WhatsApp Number (van)"
                id="twilio_phone"
                value={settings.twilio_phone_number}
                onChange={v => setSettings(p => ({ ...p, twilio_phone_number: v }))}
                placeholder="whatsapp:+14155238886"
              />
              <div className="space-y-1.5">
                <label className="text-whatsapp-muted text-xs font-medium">Webhook URL (kopieer naar Twilio)</label>
                <div className="flex items-center gap-2 bg-whatsapp-input rounded-lg px-3 py-2">
                  <code className="text-whatsapp-teal text-xs flex-1 truncate">{webhookUrl}</code>
                  <button
                    onClick={() => navigator.clipboard.writeText(webhookUrl)}
                    className="text-whatsapp-muted hover:text-whatsapp-text text-xs shrink-0"
                  >
                    Kopieer
                  </button>
                </div>
                <p className="text-whatsapp-muted text-[11px]">Stel deze URL in als &quot;Incoming Message&quot; webhook in de Twilio WhatsApp Sandbox of je actieve nummer.</p>
              </div>
            </section>

            <hr className="border-whatsapp-border" />

            {/* Claude */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-whatsapp-text font-medium text-sm">Anthropic Claude</h3>
                <a
                  href="https://console.anthropic.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-whatsapp-teal text-xs hover:underline"
                >
                  Anthropic Console <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <Field
                label="API Key"
                id="anthropic_key"
                value={settings.anthropic_api_key}
                onChange={v => setSettings(p => ({ ...p, anthropic_api_key: v }))}
                show={showKey}
                onToggle={() => setShowKey(!showKey)}
                placeholder="sk-ant-..."
              />
              <div className="space-y-1.5">
                <label className="text-whatsapp-muted text-xs font-medium">AI Model</label>
                <select
                  value={settings.claude_model}
                  onChange={e => setSettings(p => ({ ...p, claude_model: e.target.value }))}
                  className="w-full bg-whatsapp-input text-whatsapp-text text-sm px-3 py-2 rounded-lg outline-none border border-whatsapp-border focus:border-whatsapp-teal"
                >
                  {CLAUDE_MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
            </section>

            <hr className="border-whatsapp-border" />

            {/* Security */}
            <section className="space-y-4">
              <h3 className="text-whatsapp-text font-medium text-sm">Beveiliging</h3>
              <Field
                label="App wachtwoord"
                id="app_password"
                value={settings.app_password}
                onChange={v => setSettings(p => ({ ...p, app_password: v }))}
                show={showPassword}
                onToggle={() => setShowPassword(!showPassword)}
                placeholder="Stel een wachtwoord in"
              />
              <p className="text-whatsapp-muted text-[11px]">Stel dit in om de app te beveiligen. Laat leeg om beveiliging uit te schakelen.</p>
            </section>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-whatsapp-border flex justify-between">
          <button
            onClick={logout}
            className="flex items-center gap-2 text-whatsapp-muted hover:text-red-400 text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Uitloggen
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 bg-whatsapp-teal disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-whatsapp-teal/90 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              '✓ Opgeslagen'
            ) : (
              <>
                <Save className="w-4 h-4" />
                Opslaan
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
