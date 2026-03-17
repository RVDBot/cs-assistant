import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  const diff = today.getTime() - d.getTime()
  const days = diff / (1000 * 60 * 60 * 24)

  if (days === 0) return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Gisteren'
  if (days < 7) return date.toLocaleDateString('nl-NL', { weekday: 'long' })
  return date.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export const LANGUAGE_NAMES: Record<string, string> = {
  en: '🇬🇧 Engels',
  nl: '🇳🇱 Nederlands',
  fr: '🇫🇷 Frans',
  de: '🇩🇪 Duits',
  es: '🇪🇸 Spaans',
  it: '🇮🇹 Italiaans',
  pt: '🇵🇹 Portugees',
  ar: '🇸🇦 Arabisch',
  tr: '🇹🇷 Turks',
  pl: '🇵🇱 Pools',
  ru: '🇷🇺 Russisch',
  zh: '🇨🇳 Chinees',
  ja: '🇯🇵 Japans',
  ko: '🇰🇷 Koreaans',
}

export function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] || code.toUpperCase()
}

export function formatPhone(phone: string): string {
  return phone.replace(/^whatsapp:/i, '')
}

export function formatContactName(name: string | null, phone: string, email?: string | null): string {
  const clean = phone ? formatPhone(phone) : (email || '')
  return name ? `${name} (${clean})` : clean
}
