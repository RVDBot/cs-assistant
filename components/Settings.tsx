'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Save, Loader2, Eye, EyeOff, ExternalLink, LogOut, ScrollText, Bell, BellOff, MessageSquare, Mail, Bot, ShoppingCart, BarChart3, Shield, ArrowLeft, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react'

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
  onOpenLogs?: () => void
}

function NotificationSettings() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('notif-enabled') !== '0'
  })
  const [permission, setPermission] = useState<string>('default')

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission)
    }
  }, [])

  function toggle() {
    const next = !enabled
    setEnabled(next)
    localStorage.setItem('notif-enabled', next ? '1' : '0')
  }

  async function requestPerm() {
    if (!('Notification' in window)) return
    const result = await Notification.requestPermission()
    setPermission(result)
  }

  async function sendTest() {
    if (Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      reg.showNotification('CS Assistant', {
        body: 'Meldingen werken!',
        icon: '/favicon-192x192.png',
        badge: '/favicon-192x192.png',
      })
    } else {
      new Notification('CS Assistant', {
        body: 'Meldingen werken!',
        icon: '/favicon-192x192.png',
      })
    }
  }

  const supported = typeof window !== 'undefined' && 'Notification' in window

  return (
    <div className="space-y-3">
      {!supported && (
        <p className="text-whatsapp-muted text-xs">Je browser ondersteunt geen meldingen.</p>
      )}
      {supported && permission === 'granted' && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {enabled ? <Bell className="w-4 h-4 text-whatsapp-teal" /> : <BellOff className="w-4 h-4 text-whatsapp-muted" />}
              <span className="text-whatsapp-text text-sm">{enabled ? 'Meldingen aan' : 'Meldingen uit'}</span>
            </div>
            <button
              onClick={toggle}
              className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-whatsapp-teal' : 'bg-whatsapp-border'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>
          <button
            onClick={sendTest}
            className="text-xs text-whatsapp-teal hover:underline"
          >
            Stuur testmelding
          </button>
        </>
      )}
      {supported && permission === 'default' && (
        <button
          onClick={requestPerm}
          className="flex items-center gap-2 text-sm bg-whatsapp-teal text-white px-3 py-1.5 rounded-lg hover:bg-whatsapp-teal/90 transition-colors"
        >
          <Bell className="w-4 h-4" />
          Meldingen inschakelen
        </button>
      )}
      {supported && permission === 'denied' && (
        <p className="text-whatsapp-muted text-xs">Meldingen zijn geblokkeerd door je browser. Wijzig dit in je browserinstellingen.</p>
      )}
      <p className="text-whatsapp-muted text-[11px]">
        Status: {!supported ? 'niet ondersteund' : permission === 'granted' ? 'toegestaan' : permission === 'denied' ? 'geblokkeerd' : 'niet ingesteld'}
      </p>
    </div>
  )
}

type Tab = 'whatsapp' | 'email' | 'claude' | 'woocommerce' | 'general'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'whatsapp', label: 'WhatsApp', icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'email', label: 'Email', icon: <Mail className="w-4 h-4" /> },
  { id: 'claude', label: 'Claude', icon: <Bot className="w-4 h-4" /> },
  { id: 'woocommerce', label: 'WooCommerce', icon: <ShoppingCart className="w-4 h-4" /> },
  { id: 'general', label: 'Algemeen', icon: <Shield className="w-4 h-4" /> },
]

export default function Settings({ onClose, onOpenLogs }: Props) {
  const [activeTab, setActiveTab] = useState<Tab | null>(null)
  const [settings, setSettings] = useState({
    twilio_account_sid: '',
    twilio_auth_token: '',
    twilio_phone_number: '',
    base_url: '',
    anthropic_api_key: '',
    claude_model: 'claude-opus-4-6',
    app_password: '',
    wc_store_url: '',
    wc_consumer_key: '',
    wc_consumer_secret: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showWcSecret, setShowWcSecret] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [tokenStats, setTokenStats] = useState<{
    total_input: number
    total_output: number
    total_calls: number
    by_type: { call_type: string; label: string; input_tokens: number; output_tokens: number; calls: number }[]
  } | null>(null)

  // Email accounts state
  interface EmailAccountForm {
    id?: number
    name: string
    enabled: number
    imap_host: string
    imap_port: number
    imap_user: string
    imap_password: string
    smtp_host: string
    smtp_port: number
    smtp_user: string
    smtp_password: string
    from_name: string
  }
  const [emailAccounts, setEmailAccounts] = useState<EmailAccountForm[]>([])
  const [editingAccount, setEditingAccount] = useState<EmailAccountForm | null>(null)
  const [showImapPass, setShowImapPass] = useState(false)
  const [showSmtpPass, setShowSmtpPass] = useState(false)
  const [emailTesting, setEmailTesting] = useState<number | null>(null)
  const [emailTestResult, setEmailTestResult] = useState<{ accountId: number; imap: boolean; smtp: boolean; errors: string[] } | null>(null)

  const router = useRouter()

  const emptyAccount: EmailAccountForm = {
    name: '',
    enabled: 1,
    imap_host: 'imap.gmail.com',
    imap_port: 993,
    imap_user: '',
    imap_password: '',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    from_name: 'SpeedRope Shop',
  }

  async function fetchEmailAccounts() {
    const res = await fetch('/api/email/accounts')
    setEmailAccounts(await res.json())
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/twilio/webhook`)
    }
    Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/token-usage').then(r => r.json()),
      fetch('/api/email/accounts').then(r => r.json()),
    ]).then(([settingsData, tokenData, accountsData]) => {
      setSettings(prev => ({ ...prev, ...settingsData }))
      setTokenStats(tokenData)
      setEmailAccounts(accountsData)
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

  const activeTabLabel = TABS.find(t => t.id === activeTab)?.label
  // On desktop the content panel is always visible, so default to first tab for rendering
  const contentTab = activeTab || 'whatsapp'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-whatsapp-panel border border-whatsapp-border rounded-xl w-full max-w-[580px] max-h-[85vh] mx-4 md:mx-0 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-whatsapp-border">
          <div className="flex items-center gap-2">
            {/* Mobile: back button when inside a tab */}
            {activeTab && (
              <button
                onClick={() => setActiveTab(null)}
                className="md:hidden p-1 -ml-1 text-whatsapp-muted hover:text-whatsapp-text transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-whatsapp-text font-semibold">
              {activeTab ? <span className="md:hidden">{activeTabLabel}</span> : null}
              <span className={activeTab ? 'hidden md:inline' : ''}>Instellingen</span>
            </h2>
          </div>
          <button onClick={onClose} className="text-whatsapp-muted hover:text-whatsapp-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-whatsapp-teal" />
          </div>
        ) : (
          <div className="flex-1 flex min-h-0">
            {/* Tab sidebar — always visible on desktop, only when no tab selected on mobile */}
            <div className={`${activeTab ? 'hidden md:block' : ''} w-full md:w-[160px] shrink-0 md:border-r border-whatsapp-border py-2 overflow-y-auto`}>
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2.5 px-4 py-3 md:py-2.5 text-sm transition-colors ${
                    contentTab === tab.id
                      ? 'md:text-whatsapp-teal md:bg-whatsapp-teal/10 md:border-r-2 md:border-whatsapp-teal text-whatsapp-text'
                      : 'text-whatsapp-muted hover:text-whatsapp-text hover:bg-whatsapp-input'
                  }`}
                >
                  {tab.icon}
                  <span className="flex-1 text-left">{tab.label}</span>
                  <ChevronRight className="w-4 h-4 md:hidden text-whatsapp-muted" />
                </button>
              ))}
            </div>

            {/* Tab content — always visible on desktop, only when tab selected on mobile */}
            <div className={`${activeTab ? '' : 'hidden md:block'} flex-1 overflow-y-auto p-5 space-y-4`}>

              {/* WhatsApp tab */}
              {contentTab === 'whatsapp' && (
                <>
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
                  <Field
                    label="App URL (voor bezorgstatus)"
                    id="base_url"
                    value={settings.base_url}
                    onChange={v => setSettings(p => ({ ...p, base_url: v }))}
                    placeholder="https://jouw-domein.com"
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
                  {settings.base_url && (
                    <div className="space-y-1.5">
                      <label className="text-whatsapp-muted text-xs font-medium">Status Callback URL (voor bezorgd/gelezen)</label>
                      <div className="flex items-center gap-2 bg-whatsapp-input rounded-lg px-3 py-2">
                        <code className="text-whatsapp-teal text-xs flex-1 truncate">
                          {settings.base_url.replace(/\/$/, '')}/api/twilio/status
                        </code>
                        <button
                          onClick={() => navigator.clipboard.writeText(`${settings.base_url.replace(/\/$/, '')}/api/twilio/status`)}
                          className="text-whatsapp-muted hover:text-whatsapp-text text-xs shrink-0"
                        >
                          Kopieer
                        </button>
                      </div>
                      <p className="text-whatsapp-muted text-[11px]">Wordt automatisch meegestuurd bij elk uitgaand bericht voor bezorgd/gelezen status.</p>
                    </div>
                  )}
                </>
              )}

              {/* Email tab */}
              {contentTab === 'email' && (
                <>
                  {editingAccount ? (
                    /* Account edit/create form */
                    <>
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setEditingAccount(null); setShowImapPass(false); setShowSmtpPass(false) }} className="text-whatsapp-muted hover:text-whatsapp-text">
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <h3 className="text-whatsapp-text font-medium text-sm">
                          {editingAccount.id ? 'Account bewerken' : 'Nieuw account'}
                        </h3>
                      </div>

                      <Field label="Naam" id="acc_name" value={editingAccount.name} onChange={v => setEditingAccount(p => p && ({ ...p, name: v }))} placeholder="Bijv. Google Workspace of Proton Mail" />
                      <Field label="Afzendernaam" id="acc_from_name" value={editingAccount.from_name} onChange={v => setEditingAccount(p => p && ({ ...p, from_name: v }))} placeholder="SpeedRope Shop" />

                      <div className="flex items-center justify-between">
                        <span className="text-whatsapp-muted text-xs font-medium">Actief</span>
                        <button
                          onClick={() => setEditingAccount(p => p && ({ ...p, enabled: p.enabled ? 0 : 1 }))}
                          className={`relative w-10 h-5 rounded-full transition-colors ${editingAccount.enabled ? 'bg-whatsapp-teal' : 'bg-whatsapp-border'}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${editingAccount.enabled ? 'left-5' : 'left-0.5'}`} />
                        </button>
                      </div>

                      <div className="space-y-3">
                        <p className="text-whatsapp-muted text-xs font-medium">IMAP (inkomend)</p>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Host" id="acc_imap_host" value={editingAccount.imap_host} onChange={v => setEditingAccount(p => p && ({ ...p, imap_host: v }))} placeholder="imap.gmail.com" />
                          <Field label="Poort" id="acc_imap_port" value={String(editingAccount.imap_port)} onChange={v => setEditingAccount(p => p && ({ ...p, imap_port: parseInt(v) || 993 }))} placeholder="993" />
                        </div>
                        <Field label="Gebruiker" id="acc_imap_user" value={editingAccount.imap_user} onChange={v => setEditingAccount(p => p && ({ ...p, imap_user: v }))} placeholder="help@speedropeshop.com" />
                        <Field label="Wachtwoord" id="acc_imap_password" value={editingAccount.imap_password} onChange={v => setEditingAccount(p => p && ({ ...p, imap_password: v }))} show={showImapPass} onToggle={() => setShowImapPass(!showImapPass)} />
                      </div>

                      <div className="space-y-3">
                        <p className="text-whatsapp-muted text-xs font-medium">SMTP (uitgaand)</p>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Host" id="acc_smtp_host" value={editingAccount.smtp_host} onChange={v => setEditingAccount(p => p && ({ ...p, smtp_host: v }))} placeholder="smtp.gmail.com" />
                          <Field label="Poort" id="acc_smtp_port" value={String(editingAccount.smtp_port)} onChange={v => setEditingAccount(p => p && ({ ...p, smtp_port: parseInt(v) || 587 }))} placeholder="587" />
                        </div>
                        <Field label="Gebruiker" id="acc_smtp_user" value={editingAccount.smtp_user} onChange={v => setEditingAccount(p => p && ({ ...p, smtp_user: v }))} placeholder="help@speedropeshop.com" />
                        <Field label="Wachtwoord" id="acc_smtp_password" value={editingAccount.smtp_password} onChange={v => setEditingAccount(p => p && ({ ...p, smtp_password: v }))} show={showSmtpPass} onToggle={() => setShowSmtpPass(!showSmtpPass)} />
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={async () => {
                            const method = editingAccount.id ? 'PUT' : 'POST'
                            const payload = editingAccount.id ? editingAccount : { ...editingAccount }
                            await fetch('/api/email/accounts', {
                              method,
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(payload),
                            })
                            await fetchEmailAccounts()
                            setEditingAccount(null)
                            setShowImapPass(false)
                            setShowSmtpPass(false)
                          }}
                          className="flex items-center gap-2 bg-whatsapp-teal text-white text-sm px-4 py-2 rounded-lg hover:bg-whatsapp-teal/90 transition-colors"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {editingAccount.id ? 'Bijwerken' : 'Toevoegen'}
                        </button>
                        <button
                          onClick={() => { setEditingAccount(null); setShowImapPass(false); setShowSmtpPass(false) }}
                          className="text-sm text-whatsapp-muted hover:text-whatsapp-text px-4 py-2 rounded-lg hover:bg-whatsapp-input transition-colors"
                        >
                          Annuleren
                        </button>
                      </div>
                    </>
                  ) : (
                    /* Account list */
                    <>
                      <div className="flex items-center justify-between">
                        <h3 className="text-whatsapp-text font-medium text-sm">Email Accounts</h3>
                        <button
                          onClick={() => setEditingAccount({ ...emptyAccount })}
                          className="flex items-center gap-1.5 text-xs text-whatsapp-teal hover:underline"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Account toevoegen
                        </button>
                      </div>
                      <p className="text-whatsapp-muted text-[11px]">Koppel meerdere email accounts (bijv. Google Workspace en Proton Mail).</p>

                      {emailAccounts.length === 0 ? (
                        <div className="bg-whatsapp-input rounded-lg p-4 text-center">
                          <p className="text-whatsapp-muted text-sm">Geen email accounts geconfigureerd</p>
                          <button
                            onClick={() => setEditingAccount({ ...emptyAccount })}
                            className="mt-2 text-xs text-whatsapp-teal hover:underline"
                          >
                            Voeg je eerste account toe
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {emailAccounts.map(acc => (
                            <div key={acc.id} className="bg-whatsapp-input rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Mail className="w-4 h-4 text-whatsapp-muted" />
                                  <span className="text-whatsapp-text text-sm font-medium">{acc.name}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${acc.enabled ? 'bg-green-500/20 text-green-400' : 'bg-whatsapp-border text-whatsapp-muted'}`}>
                                    {acc.enabled ? 'Actief' : 'Inactief'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingAccount({ ...acc })
                                      setShowImapPass(false)
                                      setShowSmtpPass(false)
                                    }}
                                    className="p-1.5 text-whatsapp-muted hover:text-whatsapp-text transition-colors"
                                    title="Bewerken"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`Account "${acc.name}" verwijderen?`)) return
                                      await fetch('/api/email/accounts', {
                                        method: 'DELETE',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ id: acc.id }),
                                      })
                                      await fetchEmailAccounts()
                                      setEmailTestResult(null)
                                    }}
                                    className="p-1.5 text-whatsapp-muted hover:text-red-400 transition-colors"
                                    title="Verwijderen"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              <p className="text-whatsapp-muted text-xs">{acc.imap_user}</p>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={async () => {
                                    setEmailTesting(acc.id!)
                                    setEmailTestResult(null)
                                    try {
                                      const res = await fetch('/api/email/test', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ accountId: acc.id }),
                                      })
                                      const result = await res.json()
                                      setEmailTestResult({ ...result, accountId: acc.id })
                                    } catch {
                                      setEmailTestResult({ accountId: acc.id!, imap: false, smtp: false, errors: ['Test mislukt'] })
                                    }
                                    setEmailTesting(null)
                                  }}
                                  disabled={emailTesting === acc.id}
                                  className="flex items-center gap-1.5 text-xs bg-whatsapp-deeper text-whatsapp-text px-2.5 py-1 rounded hover:bg-whatsapp-border transition-colors disabled:opacity-50"
                                >
                                  {emailTesting === acc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                  Test
                                </button>
                                <button
                                  onClick={async () => {
                                    await fetch('/api/email/accounts', {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ id: acc.id, enabled: acc.enabled ? 0 : 1 }),
                                    })
                                    await fetchEmailAccounts()
                                  }}
                                  className="text-xs text-whatsapp-muted hover:text-whatsapp-text"
                                >
                                  {acc.enabled ? 'Deactiveren' : 'Activeren'}
                                </button>
                                {emailTestResult && emailTestResult.accountId === acc.id && (
                                  <div className="text-xs">
                                    <span className={emailTestResult.imap ? 'text-green-400' : 'text-red-400'}>
                                      IMAP: {emailTestResult.imap ? '✓' : '✗'}
                                    </span>
                                    {' · '}
                                    <span className={emailTestResult.smtp ? 'text-green-400' : 'text-red-400'}>
                                      SMTP: {emailTestResult.smtp ? '✓' : '✗'}
                                    </span>
                                    {emailTestResult.errors.length > 0 && (
                                      <span className="text-red-400 ml-1">{emailTestResult.errors.join(', ')}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Claude tab */}
              {contentTab === 'claude' && (
                <>
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

                  <hr className="border-whatsapp-border" />

                  {/* Token Usage */}
                  <h3 className="text-whatsapp-text font-medium text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Tokengebruik
                  </h3>
                  {tokenStats && (tokenStats.total_input > 0 || tokenStats.total_output > 0) ? (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-whatsapp-input rounded-lg px-3 py-2 text-center">
                          <p className="text-whatsapp-teal text-sm font-mono font-semibold">{tokenStats.total_input.toLocaleString('nl-NL')}</p>
                          <p className="text-whatsapp-muted text-[11px] mt-0.5">Invoer tokens</p>
                        </div>
                        <div className="bg-whatsapp-input rounded-lg px-3 py-2 text-center">
                          <p className="text-whatsapp-teal text-sm font-mono font-semibold">{tokenStats.total_output.toLocaleString('nl-NL')}</p>
                          <p className="text-whatsapp-muted text-[11px] mt-0.5">Uitvoer tokens</p>
                        </div>
                        <div className="bg-whatsapp-input rounded-lg px-3 py-2 text-center">
                          <p className="text-whatsapp-teal text-sm font-mono font-semibold">{(tokenStats.total_input + tokenStats.total_output).toLocaleString('nl-NL')}</p>
                          <p className="text-whatsapp-muted text-[11px] mt-0.5">Totaal</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {tokenStats.by_type.map(row => (
                          <div key={row.call_type} className="flex items-center justify-between text-xs px-1">
                            <span className="text-whatsapp-muted">{row.label}</span>
                            <span className="text-whatsapp-text font-mono">
                              {(row.input_tokens + row.output_tokens).toLocaleString('nl-NL')}
                              <span className="text-whatsapp-muted ml-1">({row.calls}×)</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-whatsapp-muted text-xs">Nog geen tokengebruik geregistreerd.</p>
                  )}
                </>
              )}

              {/* WooCommerce tab */}
              {contentTab === 'woocommerce' && (
                <>
                  <h3 className="text-whatsapp-text font-medium text-sm">WooCommerce</h3>
                  <Field
                    label="Winkel URL"
                    id="wc_store_url"
                    value={settings.wc_store_url}
                    onChange={v => setSettings(p => ({ ...p, wc_store_url: v }))}
                    placeholder="https://jouw-winkel.nl"
                  />
                  <Field
                    label="Consumer Key"
                    id="wc_consumer_key"
                    value={settings.wc_consumer_key}
                    onChange={v => setSettings(p => ({ ...p, wc_consumer_key: v }))}
                    placeholder="ck_..."
                  />
                  <Field
                    label="Consumer Secret"
                    id="wc_consumer_secret"
                    value={settings.wc_consumer_secret}
                    onChange={v => setSettings(p => ({ ...p, wc_consumer_secret: v }))}
                    show={showWcSecret}
                    onToggle={() => setShowWcSecret(!showWcSecret)}
                    placeholder="cs_..."
                  />
                </>
              )}

              {/* General tab */}
              {contentTab === 'general' && (
                <>
                  <section className="space-y-4">
                    <h3 className="text-whatsapp-text font-medium text-sm">Meldingen</h3>
                    <NotificationSettings />
                  </section>

                  <hr className="border-whatsapp-border" />

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
                </>
              )}

            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-whatsapp-border flex justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenLogs}
              className="flex items-center gap-2 text-whatsapp-muted hover:text-whatsapp-text text-sm transition-colors"
            >
              <ScrollText className="w-4 h-4" />
              Logs
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-2 text-whatsapp-muted hover:text-red-400 text-sm transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Uitloggen
            </button>
          </div>
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
