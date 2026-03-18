import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { log } from '@/lib/logger'
import {
  searchByPhone,
  searchByOrderNumber,
  fetchAllOrdersForEmail,
  mapOrderDetails,
  extractOrderNumbers,
  extractEmails,
  WcOrder,
  OrderDetails,
} from '@/lib/woocommerce'

interface DbOrder {
  wc_order_id: number
  order_number: string
  customer_email: string | null
  order_data: string | null
  match_sources: string
}

function cachedOrderToDetails(row: DbOrder): (OrderDetails & { matchSources: string[] }) | null {
  if (!row.order_data) return null
  try {
    const details = JSON.parse(row.order_data) as OrderDetails
    const matchSources: string[] = JSON.parse(row.match_sources || '[]')
    return { ...details, matchSources }
  } catch { return null }
}

function saveOrderData(
  db: ReturnType<typeof getDb>,
  convId: number,
  order: WcOrder,
  details: OrderDetails,
  sources: string[]
) {
  // Merge match_sources with existing ones
  const existing = db.prepare(
    'SELECT match_sources FROM customer_orders WHERE conversation_id = ? AND wc_order_id = ?'
  ).get(convId, order.id) as { match_sources: string } | undefined

  let mergedSources = sources
  if (existing) {
    const prev: string[] = JSON.parse(existing.match_sources || '[]')
    mergedSources = [...new Set([...prev, ...sources])]
  }

  db.prepare(
    `INSERT INTO customer_orders (conversation_id, wc_order_id, order_number, customer_email, order_data, match_sources)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(conversation_id, wc_order_id) DO UPDATE SET
       order_data = excluded.order_data,
       order_number = excluded.order_number,
       customer_email = excluded.customer_email,
       match_sources = ?`
  ).run(convId, order.id, order.number, order.billing.email || '', JSON.stringify(details), JSON.stringify(mergedSources), JSON.stringify(mergedSources))
}

function getDismissedIds(db: ReturnType<typeof getDb>, convId: number): Set<number> {
  const rows = db.prepare('SELECT wc_order_id FROM dismissed_orders WHERE conversation_id = ?').all(convId) as { wc_order_id: number }[]
  return new Set(rows.map(r => r.wc_order_id))
}

// GET: returns cached orders instantly, or auto-detects on first call
export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get('conversation_id')
  const refresh = req.nextUrl.searchParams.get('refresh') === '1'
  const countOnly = req.nextUrl.searchParams.get('count') === '1'

  if (!conversationId || !/^\d+$/.test(conversationId)) {
    return NextResponse.json({ error: 'Invalid conversation_id' }, { status: 400 })
  }
  const convId = Number(conversationId)
  const db = getDb()

  if (countOnly) {
    const result = db.prepare('SELECT COUNT(*) as count FROM customer_orders WHERE conversation_id = ?').get(convId) as { count: number }
    return NextResponse.json({ count: result.count })
  }

  const conv = db.prepare('SELECT customer_phone FROM conversations WHERE id = ?').get(convId) as { customer_phone: string } | undefined
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  const messages = db.prepare('SELECT content FROM messages WHERE conversation_id = ? ORDER BY sent_at ASC').all(convId) as { content: string }[]
  const allText = messages.map(m => m.content).join(' ')
  const detectedOrderNumbers = extractOrderNumbers(allText)
  const detectedEmails = extractEmails(allText)

  const linked = db.prepare('SELECT wc_order_id, order_number, customer_email, order_data, match_sources FROM customer_orders WHERE conversation_id = ?').all(convId) as DbOrder[]

  // Return cached data instantly
  if (linked.length > 0 && !refresh) {
    const orders = linked.map(l => cachedOrderToDetails(l)).filter((o): o is OrderDetails & { matchSources: string[] } => o !== null)
    return NextResponse.json({
      orders,
      detectedOrderNumbers,
      detectedEmails,
      linked: linked.map(l => l.wc_order_id),
      cached: true,
    })
  }

  // Refresh existing linked orders
  if (linked.length > 0 && refresh) {
    try {
      const email = linked.find(l => l.customer_email)?.customer_email
      let allOrders: WcOrder[] = []

      if (email) {
        allOrders = await fetchAllOrdersForEmail(email)
      }

      const allDetails = mapOrderDetails(allOrders)
      const linkedIds = new Set(linked.map(l => l.wc_order_id))
      const dismissedIds = getDismissedIds(db, convId)

      // Update existing linked orders
      for (const order of allOrders) {
        const details = allDetails.find(d => d.id === order.id)
        if (details && linkedIds.has(order.id)) {
          // Keep existing match_sources, just update data
          const existing = linked.find(l => l.wc_order_id === order.id)
          const sources: string[] = existing ? JSON.parse(existing.match_sources || '[]') : []
          saveOrderData(db, convId, order, details, sources)
        }
      }

      // Add new orders from same customer (not dismissed)
      const newOrders = allOrders.filter(o => !linkedIds.has(o.id) && !dismissedIds.has(o.id))
      for (const order of newOrders) {
        const details = allDetails.find(d => d.id === order.id)
        if (details) {
          saveOrderData(db, convId, order, details, ['email'])
        }
      }

      if (newOrders.length > 0) {
        log('info', 'systeem', `${newOrders.length} nieuwe bestelling(en) gevonden`, { email }, convId)
      }

      const freshLinked = db.prepare('SELECT wc_order_id, order_number, customer_email, order_data, match_sources FROM customer_orders WHERE conversation_id = ?').all(convId) as DbOrder[]
      const orders = freshLinked.map(l => cachedOrderToDetails(l)).filter((o): o is OrderDetails & { matchSources: string[] } => o !== null)

      return NextResponse.json({
        orders,
        detectedOrderNumbers,
        detectedEmails,
        linked: freshLinked.map(l => l.wc_order_id),
        cached: false,
      })
    } catch (e) {
      log('error', 'systeem', 'WooCommerce refresh mislukt', { error: e instanceof Error ? e.message : String(e) }, convId)
      const orders = linked.map(l => cachedOrderToDetails(l)).filter((o): o is OrderDetails & { matchSources: string[] } => o !== null)
      return NextResponse.json({
        orders,
        detectedOrderNumbers,
        detectedEmails,
        linked: linked.map(l => l.wc_order_id),
        cached: true,
        refreshError: e instanceof Error ? e.message : 'Vernieuwen mislukt',
      })
    }
  }

  // No linked orders — auto-detect (skip dismissed)
  const dismissedIds = getDismissedIds(db, convId)

  try {
    let allOrders: WcOrder[] = []
    let foundEmail = ''
    let matchSource = ''

    // 1. Search by detected order numbers
    for (const orderNum of detectedOrderNumbers) {
      const results = await searchByOrderNumber(orderNum)
      const filtered = results.filter(o => !dismissedIds.has(o.id))
      if (filtered.length > 0) {
        foundEmail = filtered[0].billing.email || ''
        matchSource = 'order_number'
        break
      }
    }

    // 2. Search by detected emails
    if (!foundEmail) {
      for (const email of detectedEmails) {
        const results = await fetchAllOrdersForEmail(email)
        const filtered = results.filter(o => !dismissedIds.has(o.id))
        if (filtered.length > 0) {
          foundEmail = email
          allOrders = filtered
          matchSource = 'email'
          break
        }
      }
    }

    // 3. Search by phone number
    if (!foundEmail) {
      const phoneResults = await searchByPhone(conv.customer_phone)
      const convPhone = (conv.customer_phone || '').replace(/^whatsapp:/i, '').replace(/[\s\-()]/g, '')
      // Only accept results where the billing phone actually matches
      const phoneMatched = phoneResults.filter(o => {
        if (dismissedIds.has(o.id)) return false
        const billingPhone = (o.billing.phone || '').replace(/[\s\-()]/g, '')
        if (!billingPhone || !convPhone) return false
        return billingPhone.includes(convPhone) || convPhone.includes(billingPhone)
      })
      if (phoneMatched.length > 0) {
        foundEmail = phoneMatched[0].billing.email || ''
        matchSource = 'phone'
      }
    }

    // 4. Fetch all orders for found email
    if (foundEmail && allOrders.length === 0) {
      allOrders = (await fetchAllOrdersForEmail(foundEmail)).filter(o => !dismissedIds.has(o.id))
    }

    // Save with match sources
    const allDetails = mapOrderDetails(allOrders)
    for (const order of allOrders) {
      const details = allDetails.find(d => d.id === order.id)
      if (details) {
        // Determine sources for each order
        const sources: string[] = [matchSource]
        // Check if this specific order also matches by phone or order number
        const billingPhone = (order.billing.phone || '').replace(/[\s\-()]/g, '')
        const convPhone = (conv.customer_phone || '').replace(/^whatsapp:/i, '').replace(/\s+/g, '')
        if (billingPhone && (billingPhone.includes(convPhone) || convPhone.includes(billingPhone))) {
          if (!sources.includes('phone')) sources.push('phone')
        }
        if (detectedOrderNumbers.some(n => order.number.toUpperCase().includes(n) || n.includes(order.number.toUpperCase()))) {
          if (!sources.includes('order_number')) sources.push('order_number')
        }
        if (detectedEmails.some(e => order.billing.email?.toLowerCase() === e)) {
          if (!sources.includes('email')) sources.push('email')
        }
        saveOrderData(db, convId, order, details, sources)
      }
    }

    if (allOrders.length > 0) {
      log('info', 'systeem', `${allOrders.length} bestelling(en) automatisch gekoppeld`, { email: foundEmail, source: matchSource }, convId)
    }

    const savedOrders = db.prepare('SELECT wc_order_id, order_number, customer_email, order_data, match_sources FROM customer_orders WHERE conversation_id = ?').all(convId) as DbOrder[]
    const orders = savedOrders.map(l => cachedOrderToDetails(l)).filter((o): o is OrderDetails & { matchSources: string[] } => o !== null)

    return NextResponse.json({
      orders,
      detectedOrderNumbers,
      detectedEmails,
      linked: allOrders.map(o => o.id),
      cached: false,
    })
  } catch (e) {
    log('error', 'systeem', 'WooCommerce zoeken mislukt', { error: e instanceof Error ? e.message : String(e) }, convId)
    return NextResponse.json({
      orders: [],
      detectedOrderNumbers,
      detectedEmails,
      linked: [],
      error: e instanceof Error ? e.message : 'WooCommerce zoeken mislukt',
    })
  }
}

// POST: manual search and link orders
export async function POST(req: NextRequest) {
  const { conversation_id, search } = await req.json()

  if (!conversation_id || !search) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const convId = Number(conversation_id)
  if (!Number.isInteger(convId) || convId < 1) {
    return NextResponse.json({ error: 'Invalid conversation_id' }, { status: 400 })
  }

  const db = getDb()

  try {
    const results = await searchByOrderNumber(search.trim())

    if (results.length === 0) {
      return NextResponse.json({ orders: [], message: 'Geen bestellingen gevonden' })
    }

    const email = results[0].billing.email
    let allOrders = results
    if (email) {
      allOrders = await fetchAllOrdersForEmail(email)
    }

    const allDetails = mapOrderDetails(allOrders)
    for (const order of allOrders) {
      const details = allDetails.find(d => d.id === order.id)
      if (details) {
        saveOrderData(db, convId, order, details, ['manual'])
      }
      // Remove from dismissed if re-added manually
      db.prepare('DELETE FROM dismissed_orders WHERE conversation_id = ? AND wc_order_id = ?').run(convId, order.id)
    }

    log('info', 'systeem', `${allOrders.length} bestelling(en) gekoppeld via zoekopdracht "${search}"`, { email }, convId)

    const savedOrders = db.prepare('SELECT wc_order_id, order_number, customer_email, order_data, match_sources FROM customer_orders WHERE conversation_id = ?').all(convId) as DbOrder[]
    const orders = savedOrders.map(l => cachedOrderToDetails(l)).filter((o): o is OrderDetails & { matchSources: string[] } => o !== null)

    return NextResponse.json({
      orders,
      linked: allOrders.map(o => o.id),
    })
  } catch (e) {
    log('error', 'systeem', 'WooCommerce zoeken mislukt', { error: e instanceof Error ? e.message : String(e), search }, convId)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Zoeken mislukt' }, { status: 500 })
  }
}

// DELETE: unlink an order and remember dismissal
export async function DELETE(req: NextRequest) {
  const { conversation_id, wc_order_id } = await req.json()

  if (!conversation_id || !wc_order_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const convId = Number(conversation_id)
  const orderId = Number(wc_order_id)
  if (!Number.isInteger(convId) || convId < 1 || !Number.isInteger(orderId) || orderId < 1) {
    return NextResponse.json({ error: 'Invalid IDs' }, { status: 400 })
  }

  const db = getDb()
  db.prepare('DELETE FROM customer_orders WHERE conversation_id = ? AND wc_order_id = ?').run(convId, orderId)
  // Remember this dismissal so auto-detect doesn't re-add it
  db.prepare('INSERT OR IGNORE INTO dismissed_orders (conversation_id, wc_order_id) VALUES (?, ?)').run(convId, orderId)

  log('info', 'systeem', `Bestelling ${orderId} losgekoppeld`, {}, convId)

  return NextResponse.json({ ok: true })
}
