import { getDb } from './db'
import { log } from './logger'

function getCredentials() {
  const db = getDb()
  const get = (key: string) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value || ''

  const dbUrl = get('wc_store_url')
  const dbKey = get('wc_consumer_key')
  const dbSecret = get('wc_consumer_secret')
  const envUrl = process.env.WC_STORE_URL || ''
  const envKey = process.env.WC_CONSUMER_KEY || ''
  const envSecret = process.env.WC_CONSUMER_SECRET || ''

  const storeUrl = (dbUrl || envUrl).replace(/\/$/, '')
  const consumerKey = dbKey || envKey
  const consumerSecret = dbSecret || envSecret

  log('info', 'systeem', 'WC credentials check', {
    dbUrl: !!dbUrl,
    dbKey: !!dbKey,
    dbSecret: !!dbSecret,
    envUrl: !!envUrl,
    envKey: !!envKey,
    envSecret: !!envSecret,
    hasStoreUrl: !!storeUrl,
    hasKey: !!consumerKey,
    hasSecret: !!consumerSecret,
  })

  return { storeUrl, consumerKey, consumerSecret }
}

export interface WcAddress {
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

export interface WcLineItem {
  name: string
  quantity: number
  total: string
  sku: string
  price: number
}

export interface WcTrackingItem {
  tracking_provider: string
  tracking_number: string
  tracking_link: string
  date_shipped: string
}

export interface WcOrder {
  id: number
  number: string
  status: string
  date_created: string
  billing: WcAddress
  shipping: WcAddress
  line_items: WcLineItem[]
  total: string
  currency: string
  payment_method_title: string
  meta_data: { key: string; value: unknown }[]
}

export interface OrderDetails {
  id: number
  number: string
  status: string
  statusLabel: string
  dateCreated: string
  billing: WcAddress
  shipping: WcAddress
  sameAddress: boolean
  items: WcLineItem[]
  tracking: WcTrackingItem[]
  total: string
  currency: string
  adminUrl: string
  paymentMethod: string
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'In afwachting van betaling',
  processing: 'In behandeling',
  'on-hold': 'In de wacht',
  completed: 'Afgehandeld',
  cancelled: 'Geannuleerd',
  refunded: 'Terugbetaald',
  failed: 'Mislukt',
  trash: 'Verwijderd',
}

const TRACKING_URLS: Record<string, string> = {
  postnl: 'https://postnl.nl/tracktrace/?B={number}',
  'post nl': 'https://postnl.nl/tracktrace/?B={number}',
  dhl: 'https://www.dhl.com/nl-nl/home/tracking.html?tracking-id={number}',
  'dhl parcel': 'https://www.dhl.com/nl-nl/home/tracking.html?tracking-id={number}',
  'dhl parcel nl': 'https://www.dhl.com/nl-nl/home/tracking.html?tracking-id={number}',
  dpd: 'https://tracking.dpd.de/status/nl_NL/parcel/{number}',
  ups: 'https://www.ups.com/track?tracknum={number}',
  gls: 'https://gls-group.com/NL/nl/volg-je-pakket.html?match={number}',
  fedex: 'https://www.fedex.com/fedextrack/?trknbr={number}',
  tnt: 'https://www.fedex.com/fedextrack/?trknbr={number}',
}

function buildTrackingLink(provider: string, number: string, existingLink: string): string {
  if (existingLink) return existingLink
  const key = provider.toLowerCase().trim()
  const template = TRACKING_URLS[key]
  if (template) return template.replace('{number}', encodeURIComponent(number))
  return ''
}

async function wcFetch(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const { storeUrl, consumerKey, consumerSecret } = getCredentials()
  if (!storeUrl || !consumerKey || !consumerSecret) {
    const missing = [
      !storeUrl && 'WC_STORE_URL',
      !consumerKey && 'WC_CONSUMER_KEY',
      !consumerSecret && 'WC_CONSUMER_SECRET',
    ].filter(Boolean).join(', ')
    throw new Error(`WooCommerce niet geconfigureerd (ontbreekt: ${missing})`)
  }

  const url = new URL(`${storeUrl}/wp-json/wc/v3/${endpoint}`)
  url.searchParams.set('consumer_key', consumerKey)
  url.searchParams.set('consumer_secret', consumerSecret)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(15000),
    headers: { 'Accept': 'application/json' },
  })

  if (!res.ok) {
    throw new Error(`WooCommerce API error: ${res.status}`)
  }

  return res.json()
}

function parseTracking(order: WcOrder): WcTrackingItem[] {
  const trackingMeta = order.meta_data?.find(m => m.key === '_wc_shipment_tracking_items')
  if (!trackingMeta?.value || !Array.isArray(trackingMeta.value)) return []

  return (trackingMeta.value as Record<string, string>[]).map(t => ({
    tracking_provider: t.tracking_provider || t.custom_tracking_provider || '',
    tracking_number: t.tracking_number || '',
    tracking_link: buildTrackingLink(
      t.tracking_provider || t.custom_tracking_provider || '',
      t.tracking_number || '',
      t.custom_tracking_link || t.tracking_link || ''
    ),
    date_shipped: t.date_shipped || '',
  })).filter(t => t.tracking_number)
}

function addressesMatch(a: WcAddress, b: WcAddress): boolean {
  return a.address_1 === b.address_1 && a.city === b.city && a.postcode === b.postcode && a.country === b.country
}

function toOrderDetails(order: WcOrder): OrderDetails {
  const { storeUrl } = getCredentials()
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status] || order.status,
    dateCreated: order.date_created,
    billing: order.billing,
    shipping: order.shipping,
    sameAddress: addressesMatch(order.billing, order.shipping),
    items: order.line_items.map(i => ({ name: i.name, quantity: i.quantity, total: i.total, sku: i.sku, price: i.price })),
    tracking: parseTracking(order),
    total: order.total,
    currency: order.currency,
    adminUrl: `${storeUrl}/wp-admin/admin.php?page=wc-orders&action=edit&id=${order.id}`,
    paymentMethod: order.payment_method_title,
  }
}

export async function searchOrders(query: string): Promise<WcOrder[]> {
  const orders = await wcFetch('orders', { search: query, per_page: '50', orderby: 'date', order: 'desc' }) as WcOrder[]
  return orders
}

export async function getOrderById(orderId: number): Promise<WcOrder | null> {
  try {
    const order = await wcFetch(`orders/${orderId}`) as WcOrder
    return order
  } catch {
    return null
  }
}

export async function searchByPhone(phone: string): Promise<WcOrder[]> {
  // Clean phone: remove whatsapp: prefix, try with and without country code
  const cleaned = phone.replace(/^whatsapp:/i, '').replace(/\s+/g, '')
  const orders = await searchOrders(cleaned)

  // If no results with full number, try without +
  if (orders.length === 0 && cleaned.startsWith('+')) {
    return searchOrders(cleaned.slice(1))
  }

  return orders
}

export async function searchByEmail(email: string): Promise<WcOrder[]> {
  return searchOrders(email)
}

export async function searchByOrderNumber(orderNumber: string): Promise<WcOrder[]> {
  return searchOrders(orderNumber)
}

export async function fetchAllOrdersForEmail(email: string): Promise<WcOrder[]> {
  if (!email) return []
  return searchOrders(email)
}

export function mapOrderDetails(orders: WcOrder[]): OrderDetails[] {
  return orders.map(toOrderDetails)
}

export function extractOrderNumbers(text: string): string[] {
  const matches = text.match(/COM-?\d+/gi)
  return matches ? [...new Set(matches.map(m => m.toUpperCase()))] : []
}

export function extractEmails(text: string): string[] {
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)
  return matches ? [...new Set(matches.map(m => m.toLowerCase()))] : []
}
