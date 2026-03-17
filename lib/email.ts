import { getDb } from './db'
import { detectLanguage, translateToDutch } from './claude'
import { log } from './logger'

function getEmailSettings() {
  const db = getDb()
  const get = (key: string) =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value || ''

  return {
    enabled: get('email_enabled') === 'true',
    imap: {
      host: get('email_imap_host') || 'imap.gmail.com',
      port: parseInt(get('email_imap_port') || '993', 10),
      user: get('email_imap_user'),
      password: get('email_imap_password'),
    },
    smtp: {
      host: get('email_smtp_host') || 'smtp.gmail.com',
      port: parseInt(get('email_smtp_port') || '587', 10),
      user: get('email_smtp_user'),
      password: get('email_smtp_password'),
    },
    fromName: get('email_from_name') || 'SpeedRope Shop',
  }
}

export async function sendEmail(to: string, subject: string, body: string, inReplyTo?: string): Promise<string> {
  const settings = getEmailSettings()
  if (!settings.smtp.user || !settings.smtp.password) {
    throw new Error('SMTP credentials not configured')
  }

  const nodemailer = await import('nodemailer')
  const transport = nodemailer.createTransport({
    host: settings.smtp.host,
    port: settings.smtp.port,
    secure: settings.smtp.port === 465,
    auth: {
      user: settings.smtp.user,
      pass: settings.smtp.password,
    },
  })

  const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@speedropeshop.com>`

  const mailOptions: Record<string, unknown> = {
    from: `"${settings.fromName}" <${settings.smtp.user}>`,
    to,
    subject,
    text: body,
    messageId,
  }

  if (inReplyTo) {
    mailOptions.inReplyTo = inReplyTo
    mailOptions.references = inReplyTo
  }

  await transport.sendMail(mailOptions)
  return messageId
}

export async function testEmailConnection(): Promise<{ imap: boolean; smtp: boolean; errors: string[] }> {
  const settings = getEmailSettings()
  const errors: string[] = []
  let imapOk = false
  let smtpOk = false

  // Test IMAP
  if (settings.imap.user && settings.imap.password) {
    try {
      const { ImapFlow } = await import('imapflow')
      const client = new ImapFlow({
        host: settings.imap.host,
        port: settings.imap.port,
        secure: true,
        auth: { user: settings.imap.user, pass: settings.imap.password },
        logger: false,
      })
      await client.connect()
      await client.logout()
      imapOk = true
    } catch (e) {
      errors.push(`IMAP: ${e instanceof Error ? e.message : String(e)}`)
    }
  } else {
    errors.push('IMAP: credentials niet ingevuld')
  }

  // Test SMTP
  if (settings.smtp.user && settings.smtp.password) {
    try {
      const nodemailer = await import('nodemailer')
      const transport = nodemailer.createTransport({
        host: settings.smtp.host,
        port: settings.smtp.port,
        secure: settings.smtp.port === 465,
        auth: { user: settings.smtp.user, pass: settings.smtp.password },
      })
      await transport.verify()
      smtpOk = true
    } catch (e) {
      errors.push(`SMTP: ${e instanceof Error ? e.message : String(e)}`)
    }
  } else {
    errors.push('SMTP: credentials niet ingevuld')
  }

  return { imap: imapOk, smtp: smtpOk, errors }
}

let pollingActive = false
let pollingTimer: ReturnType<typeof setTimeout> | null = null

export function startEmailPolling() {
  if (pollingActive) return
  pollingActive = true
  pollEmails()
}

export function stopEmailPolling() {
  pollingActive = false
  if (pollingTimer) {
    clearTimeout(pollingTimer)
    pollingTimer = null
  }
}

async function pollEmails() {
  if (!pollingActive) return

  try {
    const settings = getEmailSettings()
    if (settings.enabled && settings.imap.user && settings.imap.password) {
      await fetchNewEmails(settings)
    }
  } catch (e) {
    log('error', 'systeem', 'Email polling fout', { error: e instanceof Error ? e.message : String(e) })
  }

  if (pollingActive) {
    pollingTimer = setTimeout(pollEmails, 60000)
  }
}

async function fetchNewEmails(settings: ReturnType<typeof getEmailSettings>) {
  const { ImapFlow } = await import('imapflow')
  const { htmlToText } = await import('html-to-text')

  const client = new ImapFlow({
    host: settings.imap.host,
    port: settings.imap.port,
    secure: true,
    auth: { user: settings.imap.user, pass: settings.imap.password },
    logger: false,
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')

    try {
      const messages = client.fetch({ seen: false }, {
        envelope: true,
        source: true,
        uid: true,
      })

      for await (const msg of messages) {
        try {
          await processIncomingEmail(msg as unknown as { uid: number; envelope?: Record<string, unknown>; source: Buffer }, htmlToText, settings)
          // Mark as seen
          await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true })
        } catch (e) {
          log('error', 'systeem', 'Fout bij verwerken email', {
            error: e instanceof Error ? e.message : String(e),
            uid: msg.uid,
          })
        }
      }
    } finally {
      lock.release()
    }

    await client.logout()
  } catch (e) {
    log('error', 'systeem', 'IMAP verbinding mislukt', { error: e instanceof Error ? e.message : String(e) })
    try { await client.logout() } catch {}
  }
}

async function processIncomingEmail(
  msg: { uid: number; envelope?: Record<string, unknown>; source: Buffer },
  htmlToText: (html: string, options?: Record<string, unknown>) => string,
  settings: ReturnType<typeof getEmailSettings>
) {
  const envelope = msg.envelope || {} as Record<string, unknown>
  const fromList = (envelope.from || []) as Array<{ address?: string; name?: string }>
  const fromAddr = fromList[0]?.address?.toLowerCase() || ''
  const fromName = fromList[0]?.name || ''
  const subject = (envelope.subject as string) || '(geen onderwerp)'
  const messageId = (envelope.messageId as string) || ''
  const inReplyTo = (envelope.inReplyTo as string) || ''

  // Skip emails from ourselves
  if (fromAddr === settings.smtp.user?.toLowerCase()) return

  // Parse body from raw source
  const { simpleParser } = await import('mailparser')
  const parsed = await simpleParser(msg.source)
  let body = parsed.text || ''
  if (!body && parsed.html) {
    body = htmlToText(parsed.html, { wordwrap: false })
  }
  if (!body) body = '(leeg bericht)'

  // Strip quoted reply text (common patterns)
  body = stripQuotedReply(body)

  const db = getDb()

  // Try to find existing conversation
  let convId: number | null = null

  // 1. Check by In-Reply-To header → match against existing email_message_id
  if (inReplyTo) {
    const existing = db.prepare(
      'SELECT conversation_id FROM messages WHERE email_message_id = ? LIMIT 1'
    ).get(inReplyTo) as { conversation_id: number } | undefined
    if (existing) convId = existing.conversation_id
  }

  // 2. Check by customer_email
  if (!convId) {
    const existingConv = db.prepare(
      'SELECT id FROM conversations WHERE customer_email = ?'
    ).get(fromAddr) as { id: number } | undefined
    if (existingConv) convId = existingConv.id
  }

  // 3. Create new conversation
  if (!convId) {
    const result = db.prepare(`
      INSERT INTO conversations (customer_email, customer_name, updated_at, last_message, unread_count)
      VALUES (?, ?, CURRENT_TIMESTAMP, ?, 1)
    `).run(fromAddr, fromName || null, body.slice(0, 100))
    convId = result.lastInsertRowid as number

    log('info', 'bericht', `Nieuwe email-conversatie aangemaakt`, { from: fromAddr, name: fromName }, convId)
  } else {
    // Update existing conversation
    db.prepare(`
      UPDATE conversations SET
        updated_at = CURRENT_TIMESTAMP,
        last_message = ?,
        unread_count = unread_count + 1
      WHERE id = ?
    `).run(body.slice(0, 100), convId)

    // Update customer name if we didn't have one
    if (fromName) {
      db.prepare(`
        UPDATE conversations SET customer_name = ? WHERE id = ? AND customer_name IS NULL
      `).run(fromName, convId)
    }
  }

  // Detect language and translate
  let language = 'en'
  let dutchContent = body
  try {
    language = await detectLanguage(body, convId)
    dutchContent = await translateToDutch(body, language, convId)

    // Update detected language on conversation
    db.prepare('UPDATE conversations SET detected_language = ? WHERE id = ?').run(language, convId)
  } catch (e) {
    log('error', 'ai', 'Vertaling email mislukt', { error: e instanceof Error ? e.message : String(e), from: fromAddr }, convId)
  }

  // Save message
  db.prepare(`
    INSERT INTO messages (conversation_id, direction, content, content_dutch, language, status, channel, email_subject, email_message_id, email_in_reply_to)
    VALUES (?, 'inbound', ?, ?, ?, 'received', 'email', ?, ?, ?)
  `).run(convId, body, dutchContent, language, subject, messageId, inReplyTo || null)

  log('info', 'bericht', `Email ontvangen van ${fromAddr} (${language.toUpperCase()})`, { from: fromAddr, subject }, convId)

  // Try auto-merge with existing WhatsApp conversation via WooCommerce
  tryAutoMerge(fromAddr, convId)
}

function stripQuotedReply(text: string): string {
  // Remove common reply patterns
  const lines = text.split('\n')
  const cutPatterns = [
    /^On .+ wrote:$/,
    /^Op .+ schreef .+:$/,
    /^Am .+ schrieb .+:$/,
    /^Le .+ a écrit :$/,
    /^-{3,}\s*Original Message\s*-{3,}/i,
    /^-{3,}\s*Oorspronkelijk bericht\s*-{3,}/i,
    /^From:/,
    /^Van:/,
    /^>+\s/,
  ]

  let cutIndex = lines.length
  for (let i = 0; i < lines.length; i++) {
    if (cutPatterns.some(p => p.test(lines[i].trim()))) {
      cutIndex = i
      break
    }
  }

  return lines.slice(0, cutIndex).join('\n').trim()
}

async function tryAutoMerge(email: string, emailConvId: number) {
  try {
    const { searchByEmail } = await import('./woocommerce')
    const orders = await searchByEmail(email)

    if (orders.length === 0) return

    // Look for a phone number in orders that matches an existing WhatsApp conversation
    const db = getDb()
    for (const order of orders) {
      const phone = order.billing.phone
      if (!phone) continue

      // Normalize phone for matching
      const phoneVariants = [
        phone.replace(/[\s\-()]/g, ''),
        `whatsapp:+${phone.replace(/[\s\-()+ ]/g, '')}`,
        `whatsapp:${phone.replace(/[\s\-()]/g, '')}`,
      ]

      for (const variant of phoneVariants) {
        const whatsappConv = db.prepare(
          'SELECT id FROM conversations WHERE customer_phone = ? AND id != ?'
        ).get(variant, emailConvId) as { id: number } | undefined

        if (whatsappConv) {
          // Merge: move all messages from email conv to whatsapp conv, add email
          mergeConversations(whatsappConv.id, emailConvId)
          log('info', 'systeem', `Auto-merge: email-conversatie ${emailConvId} samengevoegd met WhatsApp-conversatie ${whatsappConv.id}`, { email, phone: variant })
          return
        }
      }
    }
  } catch (e) {
    // Don't fail the email processing if merge fails
    log('error', 'systeem', 'Auto-merge mislukt', { error: e instanceof Error ? e.message : String(e), email })
  }
}

export function mergeConversations(keepId: number, mergeId: number) {
  const db = getDb()

  const keep = db.prepare('SELECT * FROM conversations WHERE id = ?').get(keepId) as Record<string, unknown> | undefined
  const merge = db.prepare('SELECT * FROM conversations WHERE id = ?').get(mergeId) as Record<string, unknown> | undefined

  if (!keep || !merge) throw new Error('Conversatie niet gevonden')

  // Move all messages from merge to keep
  db.prepare('UPDATE messages SET conversation_id = ? WHERE conversation_id = ?').run(keepId, mergeId)

  // Move customer_orders
  db.prepare('UPDATE customer_orders SET conversation_id = ? WHERE conversation_id = ?').run(keepId, mergeId)

  // Fill in missing fields on keep
  if (!keep.customer_email && merge.customer_email) {
    db.prepare('UPDATE conversations SET customer_email = ? WHERE id = ?').run(merge.customer_email, keepId)
  }
  if (!keep.customer_phone && merge.customer_phone) {
    db.prepare('UPDATE conversations SET customer_phone = ? WHERE id = ?').run(merge.customer_phone, keepId)
  }
  if (!keep.customer_name && merge.customer_name) {
    db.prepare('UPDATE conversations SET customer_name = ? WHERE id = ?').run(merge.customer_name, keepId)
  }

  // Update timestamps
  db.prepare(`
    UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(keepId)

  // Delete merged conversation
  db.prepare('DELETE FROM conversations WHERE id = ?').run(mergeId)
}
