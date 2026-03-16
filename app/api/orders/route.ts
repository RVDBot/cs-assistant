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
} from '@/lib/woocommerce'

// GET: get linked orders for a conversation, auto-detect on first call
export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get('conversation_id')
  if (!conversationId || !/^\d+$/.test(conversationId)) {
    return NextResponse.json({ error: 'Invalid conversation_id' }, { status: 400 })
  }
  const convId = Number(conversationId)
  const db = getDb()

  // Check existing linked orders
  const linked = db.prepare('SELECT wc_order_id, order_number, customer_email FROM customer_orders WHERE conversation_id = ?').all(convId) as {
    wc_order_id: number; order_number: string; customer_email: string | null
  }[]

  // Get conversation info
  const conv = db.prepare('SELECT customer_phone FROM conversations WHERE id = ?').get(convId) as { customer_phone: string } | undefined
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  // Extract order numbers and emails from messages
  const messages = db.prepare('SELECT content FROM messages WHERE conversation_id = ? ORDER BY sent_at ASC').all(convId) as { content: string }[]
  const allText = messages.map(m => m.content).join(' ')
  const detectedOrderNumbers = extractOrderNumbers(allText)
  const detectedEmails = extractEmails(allText)

  if (linked.length > 0) {
    // Fetch fresh details from WC for linked orders
    try {
      const orderIds = linked.map(l => l.wc_order_id)
      const email = linked.find(l => l.customer_email)?.customer_email
      let allOrders: WcOrder[] = []

      if (email) {
        allOrders = await fetchAllOrdersForEmail(email)
      }

      // Filter to only linked orders
      const linkedIds = new Set(orderIds)
      const matchedOrders = allOrders.filter(o => linkedIds.has(o.id))

      // For orders not found via email search, they might have been removed from WC
      const details = mapOrderDetails(matchedOrders)

      return NextResponse.json({
        orders: details,
        detectedOrderNumbers,
        detectedEmails,
        linked: linked.map(l => l.wc_order_id),
      })
    } catch (e) {
      log('error', 'systeem', 'WooCommerce orders ophalen mislukt', { error: e instanceof Error ? e.message : String(e) }, convId)
      // Return basic info from DB
      return NextResponse.json({
        orders: linked.map(l => ({ id: l.wc_order_id, number: l.order_number, error: true })),
        detectedOrderNumbers,
        detectedEmails,
        linked: linked.map(l => l.wc_order_id),
      })
    }
  }

  // No linked orders yet — try auto-detect
  try {
    let allOrders: WcOrder[] = []
    let foundEmail = ''

    // 1. Search by detected order numbers first
    for (const orderNum of detectedOrderNumbers) {
      const results = await searchByOrderNumber(orderNum)
      if (results.length > 0) {
        foundEmail = results[0].billing.email || ''
        break
      }
    }

    // 2. Search by detected emails
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

    // 3. Search by phone number
    if (!foundEmail) {
      const phoneResults = await searchByPhone(conv.customer_phone)
      if (phoneResults.length > 0) {
        foundEmail = phoneResults[0].billing.email || ''
      }
    }

    // 4. Fetch all orders for found email
    if (foundEmail && allOrders.length === 0) {
      allOrders = await fetchAllOrdersForEmail(foundEmail)
    }

    // Link all found orders
    const insert = db.prepare('INSERT OR IGNORE INTO customer_orders (conversation_id, wc_order_id, order_number, customer_email) VALUES (?, ?, ?, ?)')
    for (const order of allOrders) {
      insert.run(convId, order.id, order.number, order.billing.email)
    }

    if (allOrders.length > 0) {
      log('info', 'systeem', `${allOrders.length} bestelling(en) automatisch gekoppeld`, { email: foundEmail }, convId)
    }

    return NextResponse.json({
      orders: mapOrderDetails(allOrders),
      detectedOrderNumbers,
      detectedEmails,
      linked: allOrders.map(o => o.id),
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
    // Search WC
    const results = await searchByOrderNumber(search.trim())

    if (results.length === 0) {
      return NextResponse.json({ orders: [], message: 'Geen bestellingen gevonden' })
    }

    // Get email from first result and fetch all orders for that email
    const email = results[0].billing.email
    let allOrders = results
    if (email) {
      allOrders = await fetchAllOrdersForEmail(email)
    }

    // Link all found orders
    const insert = db.prepare('INSERT OR IGNORE INTO customer_orders (conversation_id, wc_order_id, order_number, customer_email) VALUES (?, ?, ?, ?)')
    for (const order of allOrders) {
      insert.run(convId, order.id, order.number, order.billing.email)
    }

    log('info', 'systeem', `${allOrders.length} bestelling(en) gekoppeld via zoekopdracht "${search}"`, { email }, convId)

    return NextResponse.json({
      orders: mapOrderDetails(allOrders),
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
