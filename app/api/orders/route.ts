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
}

function cachedOrderToDetails(row: DbOrder): OrderDetails | null {
  if (!row.order_data) return null
  try { return JSON.parse(row.order_data) as OrderDetails } catch { return null }
}

function saveOrderData(db: ReturnType<typeof getDb>, convId: number, order: WcOrder, details: OrderDetails) {
  db.prepare(
    'INSERT INTO customer_orders (conversation_id, wc_order_id, order_number, customer_email, order_data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(conversation_id, wc_order_id) DO UPDATE SET order_data = excluded.order_data, order_number = excluded.order_number, customer_email = excluded.customer_email'
  ).run(convId, order.id, order.number, order.billing.email || '', JSON.stringify(details))
}

// GET: returns cached orders instantly, or auto-detects on first call
// ?refresh=1: fetches fresh data from WC and updates cache
export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get('conversation_id')
  const refresh = req.nextUrl.searchParams.get('refresh') === '1'
  const countOnly = req.nextUrl.searchParams.get('count') === '1'

  if (!conversationId || !/^\d+$/.test(conversationId)) {
    return NextResponse.json({ error: 'Invalid conversation_id' }, { status: 400 })
  }
  const convId = Number(conversationId)
  const db = getDb()

  // Count-only mode: just return the number of linked orders (no WC API call)
  if (countOnly) {
    const result = db.prepare('SELECT COUNT(*) as count FROM customer_orders WHERE conversation_id = ?').get(convId) as { count: number }
    return NextResponse.json({ count: result.count })
  }

  const conv = db.prepare('SELECT customer_phone FROM conversations WHERE id = ?').get(convId) as { customer_phone: string } | undefined
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  // Extract detected patterns from messages
  const messages = db.prepare('SELECT content FROM messages WHERE conversation_id = ? ORDER BY sent_at ASC').all(convId) as { content: string }[]
  const allText = messages.map(m => m.content).join(' ')
  const detectedOrderNumbers = extractOrderNumbers(allText)
  const detectedEmails = extractEmails(allText)

  // Get linked orders from DB
  const linked = db.prepare('SELECT wc_order_id, order_number, customer_email, order_data FROM customer_orders WHERE conversation_id = ?').all(convId) as DbOrder[]

  // If we have cached orders and no refresh requested, return immediately
  if (linked.length > 0 && !refresh) {
    const orders = linked.map(l => cachedOrderToDetails(l)).filter((o): o is OrderDetails => o !== null)
    return NextResponse.json({
      orders,
      detectedOrderNumbers,
      detectedEmails,
      linked: linked.map(l => l.wc_order_id),
      cached: true,
    })
  }

  // Refresh mode or no linked orders: fetch from WC
  if (linked.length > 0 && refresh) {
    // Refresh existing linked orders
    try {
      const email = linked.find(l => l.customer_email)?.customer_email
      let allOrders: WcOrder[] = []

      if (email) {
        allOrders = await fetchAllOrdersForEmail(email)
      }

      const allDetails = mapOrderDetails(allOrders)

      // Update cached data for existing linked orders
      const linkedIds = new Set(linked.map(l => l.wc_order_id))
      for (const order of allOrders) {
        const details = allDetails.find(d => d.id === order.id)
        if (details && linkedIds.has(order.id)) {
          saveOrderData(db, convId, order, details)
        }
      }

      // Check for new orders from same customer that weren't linked yet
      const newOrders = allOrders.filter(o => !linkedIds.has(o.id))
      for (const order of newOrders) {
        const details = allDetails.find(d => d.id === order.id)
        if (details) {
          saveOrderData(db, convId, order, details)
        }
      }

      if (newOrders.length > 0) {
        log('info', 'systeem', `${newOrders.length} nieuwe bestelling(en) gevonden`, { email }, convId)
      }

      // Return all orders (existing + new)
      const freshLinked = db.prepare('SELECT wc_order_id, order_number, customer_email, order_data FROM customer_orders WHERE conversation_id = ?').all(convId) as DbOrder[]
      const orders = freshLinked.map(l => cachedOrderToDetails(l)).filter((o): o is OrderDetails => o !== null)

      return NextResponse.json({
        orders,
        detectedOrderNumbers,
        detectedEmails,
        linked: freshLinked.map(l => l.wc_order_id),
        cached: false,
      })
    } catch (e) {
      log('error', 'systeem', 'WooCommerce refresh mislukt', { error: e instanceof Error ? e.message : String(e) }, convId)
      // Return cached data on error
      const orders = linked.map(l => cachedOrderToDetails(l)).filter((o): o is OrderDetails => o !== null)
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

  // No linked orders — auto-detect
  try {
    let allOrders: WcOrder[] = []
    let foundEmail = ''

    for (const orderNum of detectedOrderNumbers) {
      const results = await searchByOrderNumber(orderNum)
      if (results.length > 0) {
        foundEmail = results[0].billing.email || ''
        break
      }
    }

    if (!foundEmail) {
      for (const email of detectedEmails) {
        const results = await fetchAllOrdersForEmail(email)
        if (results.length > 0) {
          foundEmail = email
          allOrders = results
          break
        }
      }
    }

    if (!foundEmail) {
      const phoneResults = await searchByPhone(conv.customer_phone)
      if (phoneResults.length > 0) {
        foundEmail = phoneResults[0].billing.email || ''
      }
    }

    if (foundEmail && allOrders.length === 0) {
      allOrders = await fetchAllOrdersForEmail(foundEmail)
    }

    // Save all found orders with cached data
    const allDetails = mapOrderDetails(allOrders)
    for (const order of allOrders) {
      const details = allDetails.find(d => d.id === order.id)
      if (details) {
        saveOrderData(db, convId, order, details)
      }
    }

    if (allOrders.length > 0) {
      log('info', 'systeem', `${allOrders.length} bestelling(en) automatisch gekoppeld`, { email: foundEmail }, convId)
    }

    return NextResponse.json({
      orders: allDetails,
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
        saveOrderData(db, convId, order, details)
      }
    }

    log('info', 'systeem', `${allOrders.length} bestelling(en) gekoppeld via zoekopdracht "${search}"`, { email }, convId)

    return NextResponse.json({
      orders: allDetails,
      linked: allOrders.map(o => o.id),
    })
  } catch (e) {
    log('error', 'systeem', 'WooCommerce zoeken mislukt', { error: e instanceof Error ? e.message : String(e), search }, convId)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Zoeken mislukt' }, { status: 500 })
  }
}

// DELETE: unlink an order from a conversation
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

  log('info', 'systeem', `Bestelling ${orderId} losgekoppeld`, {}, convId)

  return NextResponse.json({ ok: true })
}
