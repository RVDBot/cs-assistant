'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, ChevronDown, ExternalLink, Trash2, Search, Package, MapPin, Truck, AlertCircle, RefreshCw } from 'lucide-react'

interface Address {
  first_name: string
  last_name: string
  address_1: string
  address_2: string
  city: string
  postcode: string
  state: string
  country: string
  email?: string
  phone?: string
}

interface LineItem {
  name: string
  quantity: number
  total: string
  sku: string
}

interface TrackingItem {
  tracking_provider: string
  tracking_number: string
  tracking_link: string
  date_shipped: string
}

interface Order {
  id: number
  number: string
  status: string
  statusLabel: string
  dateCreated: string
  billing: Address
  shipping: Address
  sameAddress: boolean
  items: LineItem[]
  tracking: TrackingItem[]
  total: string
  currency: string
  adminUrl: string
  paymentMethod: string
  error?: boolean
}

interface Props {
  conversationId: number
  onClose: () => void
  onOrderCountChange?: (count: number) => void
}

const STATUS_COLORS: Record<string, string> = {
  processing: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-green-500/20 text-green-400',
  'on-hold': 'bg-yellow-500/20 text-yellow-400',
  pending: 'bg-yellow-500/20 text-yellow-400',
  cancelled: 'bg-red-500/20 text-red-400',
  refunded: 'bg-purple-500/20 text-purple-400',
  failed: 'bg-red-500/20 text-red-400',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatAddress(addr: Address): string {
  const lines = [
    `${addr.first_name} ${addr.last_name}`.trim(),
    addr.address_1,
    addr.address_2,
    `${addr.postcode} ${addr.city}`.trim(),
    addr.country,
  ].filter(Boolean)
  return lines.join('\n')
}

function formatCurrency(amount: string, currency: string): string {
  const num = parseFloat(amount)
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: currency || 'EUR' }).format(num)
}

export default function OrdersModal({ conversationId, onClose, onOrderCountChange }: Props) {
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [detectedOrderNumbers, setDetectedOrderNumbers] = useState<string[]>([])
  const [detectedEmails, setDetectedEmails] = useState<string[]>([])
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    loadCachedOrders()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  async function loadCachedOrders() {
    setInitialLoading(true)
    setError(null)
    try {
      // Load cached data instantly (no WC API call)
      const res = await fetch(`/api/orders?conversation_id=${conversationId}`)
      const data = await res.json()

      if (data.error && !data.orders?.length) {
        setError(data.error)
      }

      const loadedOrders = data.orders || []
      setOrders(loadedOrders)
      setDetectedOrderNumbers(data.detectedOrderNumbers || [])
      setDetectedEmails(data.detectedEmails || [])
      if (loadedOrders.length > 0) {
        setSelectedOrderId(loadedOrders[0].id)
        onOrderCountChange?.(loadedOrders.length)
      }

      // If we got cached data, refresh in background
      if (data.cached && loadedOrders.length > 0) {
        refreshOrders()
      }
    } catch {
      setError('Kon bestellingen niet laden')
    } finally {
      setInitialLoading(false)
    }
  }

  async function refreshOrders() {
    setRefreshing(true)
    try {
      const res = await fetch(`/api/orders?conversation_id=${conversationId}&refresh=1`)
      const data = await res.json()

      if (data.refreshError) {
        setError(data.refreshError)
      }

      const refreshedOrders = data.orders || []
      if (refreshedOrders.length > 0) {
        setOrders(refreshedOrders)
        onOrderCountChange?.(refreshedOrders.length)
        // Keep selection if it still exists, otherwise select first
        if (!refreshedOrders.find((o: Order) => o.id === selectedOrderId)) {
          setSelectedOrderId(refreshedOrders[0].id)
        }
      }
    } catch {
      // Silent fail — cached data is still shown
    } finally {
      setRefreshing(false)
    }
  }

  async function handleSearch(query?: string) {
    const searchTerm = query || searchInput.trim()
    if (!searchTerm) return
    setSearching(true)
    setError(null)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, search: searchTerm }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else if (data.orders?.length === 0) {
        setError('Geen bestellingen gevonden')
      } else if (data.orders?.length > 0) {
        // Merge with existing orders (avoid duplicates)
        setOrders(prev => {
          const existingIds = new Set(prev.map(o => o.id))
          const newOrders = data.orders.filter((o: Order) => !existingIds.has(o.id))
          const merged = [...prev, ...newOrders]
          onOrderCountChange?.(merged.length)
          return merged
        })
        setSelectedOrderId(data.orders[0].id)
        setSearchInput('')
      }
    } catch {
      setError('Zoeken mislukt')
    } finally {
      setSearching(false)
    }
  }

  async function handleRemoveOrder(orderId: number) {
    try {
      await fetch('/api/orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, wc_order_id: orderId }),
      })
      setOrders(prev => {
        const updated = prev.filter(o => o.id !== orderId)
        onOrderCountChange?.(updated.length)
        return updated
      })
      if (selectedOrderId === orderId) {
        setSelectedOrderId(orders.find(o => o.id !== orderId)?.id || null)
      }
    } catch {
      setError('Verwijderen mislukt')
    }
  }

  const selectedOrder = orders.find(o => o.id === selectedOrderId)

  // Filter detected items that aren't already linked
  const linkedNumbers = new Set(orders.map(o => o.number?.toUpperCase()))
  const unlinkedOrderNumbers = detectedOrderNumbers.filter(n => !linkedNumbers.has(n))
  const unlinkedEmails = detectedEmails.filter(e => !orders.some(o => o.billing?.email === e))
  const hasSuggestions = unlinkedOrderNumbers.length > 0 || unlinkedEmails.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-whatsapp-panel border border-whatsapp-border rounded-xl w-full max-w-[560px] max-h-[85vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-whatsapp-border shrink-0">
          <h2 className="text-whatsapp-text font-semibold flex items-center gap-2">
            <Package className="w-5 h-5 text-whatsapp-teal" />
            Bestellingen
            {orders.length > 0 && <span className="text-whatsapp-muted text-sm font-normal">({orders.length})</span>}
            {refreshing && <Loader2 className="w-4 h-4 animate-spin text-whatsapp-muted" />}
          </h2>
          <div className="flex items-center gap-2">
            {orders.length > 0 && !refreshing && (
              <button onClick={refreshOrders} className="text-whatsapp-muted hover:text-whatsapp-text transition-colors" title="Vernieuwen">
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="text-whatsapp-muted hover:text-whatsapp-text transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
          {initialLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-whatsapp-teal" />
              <span className="ml-2 text-whatsapp-muted text-sm">Bestellingen zoeken...</span>
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Order selector */}
              {orders.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setShowDropdown(v => !v)}
                    className="w-full flex items-center justify-between bg-whatsapp-input border border-whatsapp-border rounded-lg px-3 py-2.5 text-sm text-whatsapp-text hover:border-whatsapp-teal transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      {selectedOrder?.number || 'Selecteer bestelling'} — {selectedOrder ? formatDate(selectedOrder.dateCreated) : ''}
                      {refreshing && <Loader2 className="w-3 h-3 animate-spin text-whatsapp-muted" />}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-whatsapp-muted transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-whatsapp-panel border border-whatsapp-border rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto">
                      {orders.map(o => (
                        <button
                          key={o.id}
                          onClick={() => { setSelectedOrderId(o.id); setShowDropdown(false) }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-whatsapp-input transition-colors ${o.id === selectedOrderId ? 'bg-whatsapp-input text-whatsapp-teal' : 'text-whatsapp-text'}`}
                        >
                          <span>{o.number} — {formatDate(o.dateCreated)}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[o.status] || 'bg-whatsapp-input text-whatsapp-muted'}`}>
                            {o.statusLabel}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Single order info */}
              {orders.length === 1 && selectedOrder && (
                <div className="flex items-center justify-between">
                  <span className="text-whatsapp-text font-medium flex items-center gap-2">
                    {selectedOrder.number}
                    {refreshing && <Loader2 className="w-3 h-3 animate-spin text-whatsapp-muted" />}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[selectedOrder.status] || 'bg-whatsapp-input text-whatsapp-muted'}`}>
                    {selectedOrder.statusLabel}
                  </span>
                </div>
              )}

              {/* Order details */}
              {selectedOrder && !selectedOrder.error && (
                <div className="space-y-4">
                  {/* Meta row */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-whatsapp-muted">
                    <span>Besteld: {formatDate(selectedOrder.dateCreated)}</span>
                    <span>Totaal: {formatCurrency(selectedOrder.total, selectedOrder.currency)}</span>
                    {selectedOrder.paymentMethod && <span>Betaling: {selectedOrder.paymentMethod}</span>}
                  </div>

                  {/* WC link + remove */}
                  <div className="flex items-center gap-2">
                    <a
                      href={selectedOrder.adminUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-whatsapp-teal text-xs hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Bekijk in WooCommerce
                    </a>
                    <span className="text-whatsapp-border">|</span>
                    <button
                      onClick={() => handleRemoveOrder(selectedOrder.id)}
                      className="flex items-center gap-1 text-red-400/70 text-xs hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Verwijderen
                    </button>
                  </div>

                  {/* Shipping address */}
                  <div className="bg-whatsapp-input rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-whatsapp-muted text-xs font-medium mb-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      Leveradres
                    </div>
                    <p className="text-whatsapp-text text-sm whitespace-pre-line leading-relaxed">
                      {formatAddress(selectedOrder.shipping)}
                    </p>
                  </div>

                  {/* Billing address (only if different) */}
                  {!selectedOrder.sameAddress && (
                    <div className="bg-whatsapp-input rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-whatsapp-muted text-xs font-medium mb-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        Factuuradres
                      </div>
                      <p className="text-whatsapp-text text-sm whitespace-pre-line leading-relaxed">
                        {formatAddress(selectedOrder.billing)}
                      </p>
                    </div>
                  )}

                  {/* Order items */}
                  <div className="bg-whatsapp-input rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-whatsapp-muted text-xs font-medium mb-2">
                      <Package className="w-3.5 h-3.5" />
                      Artikelen
                    </div>
                    <div className="space-y-1.5">
                      {selectedOrder.items.map((item, i) => (
                        <div key={i} className="flex items-start justify-between text-sm">
                          <span className="text-whatsapp-text">
                            {item.quantity}x {item.name}
                            {item.sku && <span className="text-whatsapp-muted text-xs ml-1">({item.sku})</span>}
                          </span>
                          <span className="text-whatsapp-muted shrink-0 ml-2">
                            {formatCurrency(item.total, selectedOrder.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tracking */}
                  {selectedOrder.tracking.length > 0 && (
                    <div className="bg-whatsapp-input rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-whatsapp-muted text-xs font-medium mb-2">
                        <Truck className="w-3.5 h-3.5" />
                        Tracking
                      </div>
                      <div className="space-y-2">
                        {selectedOrder.tracking.map((t, i) => (
                          <div key={i} className="text-sm">
                            <div className="text-whatsapp-text">
                              {t.tracking_provider}: <span className="font-mono text-xs">{t.tracking_number}</span>
                            </div>
                            {t.date_shipped && (
                              <div className="text-whatsapp-muted text-xs">Verzonden: {formatDate(t.date_shipped)}</div>
                            )}
                            {t.tracking_link && (
                              <a
                                href={t.tracking_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-whatsapp-teal text-xs hover:underline mt-0.5"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Track & Trace
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error order */}
              {selectedOrder?.error && (
                <div className="bg-whatsapp-input rounded-lg p-3 text-whatsapp-muted text-sm">
                  Bestelgegevens konden niet worden opgehaald uit WooCommerce.
                  <button
                    onClick={() => handleRemoveOrder(selectedOrder.id)}
                    className="flex items-center gap-1 text-red-400/70 text-xs hover:text-red-400 transition-colors mt-2"
                  >
                    <Trash2 className="w-3 h-3" />
                    Verwijderen
                  </button>
                </div>
              )}

              {/* No orders found */}
              {orders.length === 0 && !initialLoading && !error && (
                <div className="text-center text-whatsapp-muted text-sm py-6">
                  Geen bestellingen gevonden voor deze klant.
                </div>
              )}

              {/* Suggestions from messages */}
              {hasSuggestions && (
                <div className="space-y-2">
                  <p className="text-whatsapp-muted text-xs">Gevonden in berichten:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {unlinkedOrderNumbers.map(n => (
                      <button
                        key={n}
                        onClick={() => handleSearch(n)}
                        disabled={searching}
                        className="bg-whatsapp-teal/10 text-whatsapp-teal text-xs px-2.5 py-1 rounded-full hover:bg-whatsapp-teal/20 transition-colors"
                      >
                        {n}
                      </button>
                    ))}
                    {unlinkedEmails.map(e => (
                      <button
                        key={e}
                        onClick={() => handleSearch(e)}
                        disabled={searching}
                        className="bg-whatsapp-teal/10 text-whatsapp-teal text-xs px-2.5 py-1 rounded-full hover:bg-whatsapp-teal/20 transition-colors"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual search */}
              <div className="border-t border-whatsapp-border pt-4">
                <p className="text-whatsapp-muted text-xs mb-2">Zoek op bestelnummer, e-mailadres of telefoonnummer</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="COM-1234 of naam@email.nl"
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    className="flex-1 bg-whatsapp-input text-whatsapp-text text-sm px-3 py-2 rounded-lg outline-none border border-whatsapp-border focus:border-whatsapp-teal placeholder:text-whatsapp-muted"
                  />
                  <button
                    onClick={() => handleSearch()}
                    disabled={searching || !searchInput.trim()}
                    className="flex items-center gap-1 bg-whatsapp-teal disabled:opacity-50 text-white text-sm px-3 py-2 rounded-lg hover:bg-whatsapp-teal/90 transition-colors"
                  >
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
