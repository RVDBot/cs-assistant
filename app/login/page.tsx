'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock } from 'lucide-react'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [passwordRequired, setPasswordRequired] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/auth')
      .then(r => r.json())
      .then(d => setPasswordRequired(d.passwordRequired))
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      const data = await res.json()

      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        setError(data.error || 'Inloggen mislukt')
      }
    } catch {
      setError('Verbindingsfout, probeer opnieuw')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="bg-surface-1 border border-border-subtle rounded-2xl p-8 shadow-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-full bg-accent-muted flex items-center justify-center mb-4">
              <Lock className="w-7 h-7 text-accent" />
            </div>
            <h1 className="text-text-primary text-xl font-semibold">CS Assistant</h1>
            <p className="text-text-tertiary text-sm mt-1">
              {passwordRequired ? 'Voer het wachtwoord in om door te gaan' : 'Klik op inloggen om door te gaan'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {passwordRequired && (
              <input
                type="password"
                placeholder="Wachtwoord"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
                className="w-full bg-surface-1 text-text-primary px-4 py-3 rounded-lg outline-none border border-border focus:border-accent placeholder:text-text-tertiary text-sm"
              />
            )}

            {error && (
              <p className="text-danger text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || (passwordRequired && !password)}
              className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Inloggen'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
