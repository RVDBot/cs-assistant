import { getDb, type EmailAccount } from './db'
import { detectLanguage, translateToDutch } from './claude'
import { log } from './logger'
import { sendPushToAllDevices } from './push'
import { selectNewUids } from './email-cutoff'
import { resolveCustomer, planFormSplit } from './email-sender'
import { stripQuotedHtml, stripQuotedText } from './email-quote'
import path from 'path'
import fs from 'fs'

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
])

async function sanitizeEmailHtml(html: string): Promise<string> {
  // Strip inline base64 images before sanitizing (they're huge and useless)
  const stripped = html.replace(/<img[^>]*src\s*=\s*["']data:[^"']*["'][^>]*\/?>/gi, '')

  const sanitizeHtml = (await import('sanitize-html')).default
  return sanitizeHtml(stripped, {
    allowedTags: (sanitizeHtml.defaults.allowedTags || []).concat(['img', 'span', 'div', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'td', 'th']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      '*': ['style', 'class'],
      'a': ['href', 'target', 'rel'],
      'img': ['src', 'alt', 'width', 'height'],
    },
    allowedSchemes: ['https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    disallowedTagsMode: 'discard',
  })
}

export function getEmailAccounts(): EmailAccount[] {
  const db = getDb()
  return db.prepare('SELECT * FROM email_accounts ORDER BY created_at ASC').all() as EmailAccount[]
}

export function getEnabledEmailAccounts(): EmailAccount[] {
  return getEmailAccounts().filter(a => a.enabled === 1)
}

export function getEmailAccountById(id: number): EmailAccount | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM email_accounts WHERE id = ?').get(id) as EmailAccount | undefined
}

/** Find the account that received the last email in this conversation, or fall back to first enabled account */
export function getAccountForConversation(conversationId: number): EmailAccount | undefined {
  const db = getDb()
  // Check the last inbound email's account
  const lastInbound = db.prepare(
    `SELECT email_account_id FROM messages WHERE conversation_id = ? AND channel = 'email' AND direction = 'inbound' AND email_account_id IS NOT NULL ORDER BY sent_at DESC LIMIT 1`
  ).get(conversationId) as { email_account_id: number } | undefined

  if (lastInbound?.email_account_id) {
    const acc = getEmailAccountById(lastInbound.email_account_id)
    if (acc) return acc
  }

  // Check last outbound email's account
  const lastOutbound = db.prepare(
    `SELECT email_account_id FROM messages WHERE conversation_id = ? AND channel = 'email' AND email_account_id IS NOT NULL ORDER BY sent_at DESC LIMIT 1`
  ).get(conversationId) as { email_account_id: number } | undefined

  if (lastOutbound?.email_account_id) {
    const acc = getEmailAccountById(lastOutbound.email_account_id)
    if (acc) return acc
  }

  // Fall back to first enabled account
  const accounts = getEnabledEmailAccounts()
  return accounts[0]
}

export async function sendEmail(to: string, subject: string, body: string, inReplyTo?: string, accountId?: number): Promise<{ messageId: string; accountId: number }> {
  let account: EmailAccount | undefined

  if (accountId) {
    account = getEmailAccountById(accountId)
  }
  if (!account) {
    const accounts = getEnabledEmailAccounts()
    account = accounts[0]
  }
  if (!account) throw new Error('Geen email account geconfigureerd')

  const nodemailer = await import('nodemailer')
  const transport = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_port === 465,
    auth: {
      user: account.smtp_user,
      pass: account.smtp_password,
    },
    tls: { rejectUnauthorized: false },
  })

  const domain = account.smtp_user.split('@')[1] || 'speedropeshop.com'
  const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${domain}>`

  const mailOptions: Record<string, unknown> = {
    from: `"${account.from_name}" <${account.smtp_user}>`,
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
  return { messageId, accountId: account.id }
}

export async function testAccountConnection(accountId: number): Promise<{ imap: boolean; smtp: boolean; errors: string[] }> {
  const account = getEmailAccountById(accountId)
  if (!account) return { imap: false, smtp: false, errors: ['Account niet gevonden'] }

  const errors: string[] = []
  let imapOk = false
  let smtpOk = false

  try {
    const { ImapFlow } = await import('imapflow')
    const client = new ImapFlow({
      host: account.imap_host,
      port: account.imap_port,
      secure: account.imap_port === 993,
      ...(account.imap_port !== 993 ? { doSTARTTLS: true } : {}),
      auth: { user: account.imap_user, pass: account.imap_password },
      logger: false,
      tls: { rejectUnauthorized: false },
    })
    await client.connect()
    try {
      const mailbox = account.imap_mailbox || 'INBOX'
      const boxes = await client.list()
      if (boxes.some(b => b.path === mailbox)) {
        imapOk = true
      } else {
        const available = boxes.map(b => b.path).filter(p => p !== '[Gmail]').join(', ')
        errors.push(`IMAP: mailbox "${mailbox}" niet gevonden. Beschikbaar: ${available}`)
      }
    } finally {
      await client.logout()
    }
  } catch (e) {
    errors.push(`IMAP: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const nodemailer = await import('nodemailer')
    const transport = nodemailer.createTransport({
      host: account.smtp_host,
      port: account.smtp_port,
      secure: account.smtp_port === 465,
      auth: { user: account.smtp_user, pass: account.smtp_password },
      tls: { rejectUnauthorized: false },
    })
    await transport.verify()
    smtpOk = true
  } catch (e) {
    errors.push(`SMTP: ${e instanceof Error ? e.message : String(e)}`)
  }

  return { imap: imapOk, smtp: smtpOk, errors }
}

let pollingActive = false

/**
 * One-time repair: website-form mail stored before Reply-To was honoured all sits in
 * one conversation under the site address. Look each message up in its mailbox, read
 * Reply-To and move it to a conversation for that customer. Runs until it succeeds
 * for every enabled account, then never again.
 */
async function splitFormConversations() {
  const db = getDb()
  const KEY = 'email_form_split_v1'
  if (db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY)) return

  const { ImapFlow } = await import('imapflow')
  const ourAddresses = new Set(getEmailAccounts().flatMap(a => [a.imap_user.toLowerCase(), a.smtp_user.toLowerCase()]))
  let moved = 0

  for (const account of getEnabledEmailAccounts()) {
    const candidates = db.prepare(`
      SELECT m.id, m.email_message_id AS messageId, c.customer_email AS conversationEmail
      FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE m.channel = 'email' AND m.direction = 'inbound' AND m.email_account_id = ? AND m.email_message_id IS NOT NULL AND m.email_message_id != ''
    `).all(account.id) as Array<{ id: number; messageId: string; conversationEmail: string | null }>
    if (candidates.length === 0) continue

    const client = new ImapFlow({
      host: account.imap_host,
      port: account.imap_port,
      secure: account.imap_port === 993,
      ...(account.imap_port !== 993 ? { doSTARTTLS: true } : {}),
      auth: { user: account.imap_user, pass: account.imap_password },
      logger: false,
      tls: { rejectUnauthorized: false },
    })
    const envelopes = new Map<string, { from?: Array<{ address?: string; name?: string }>; replyTo?: Array<{ address?: string; name?: string }> }>()
    await client.connect()
    try {
      const lock = await client.getMailboxLock(account.imap_mailbox || 'INBOX')
      try {
        for (const c of candidates) {
          const uids = await client.search({ header: { 'message-id': c.messageId } }, { uid: true })
          if (!uids || uids.length === 0) continue
          const msg = await client.fetchOne(String(uids[0]), { envelope: true }, { uid: true })
          if (msg && msg.envelope) envelopes.set(c.messageId, msg.envelope as never)
        }
      } finally {
        lock.release()
      }
    } finally {
      await client.logout().catch(() => {})
    }

    const plan = planFormSplit(candidates, envelopes, ourAddresses)
    console.log(`[email] ${account.name}: ${candidates.length} berichten bekeken, ${envelopes.size} gevonden in mailbox, ${plan.length} te verplaatsen`)
    if (plan.length === 0) continue

    const touched = new Set<number>()
    db.transaction(() => {
      for (const p of plan) {
        const from = db.prepare('SELECT conversation_id FROM messages WHERE id = ?').get(p.messageRowId) as { conversation_id: number }
        let target = db.prepare('SELECT id FROM conversations WHERE customer_email = ?').get(p.address) as { id: number } | undefined
        if (!target) {
          const r = db.prepare('INSERT INTO conversations (customer_email, customer_name, unread_count) VALUES (?, ?, 0)').run(p.address, p.name || null)
          target = { id: Number(r.lastInsertRowid) }
        }
        db.prepare('UPDATE messages SET conversation_id = ? WHERE id = ?').run(target.id, p.messageRowId)
        touched.add(from.conversation_id)
        touched.add(target.id)
        moved++
      }
      // Recompute list preview and ordering from the messages each conversation now holds
      for (const convId of touched) {
        const last = db.prepare('SELECT content, sent_at FROM messages WHERE conversation_id = ? ORDER BY sent_at DESC, id DESC LIMIT 1').get(convId) as { content: string; sent_at: string } | undefined
        if (last) {
          db.prepare('UPDATE conversations SET last_message = ?, updated_at = ? WHERE id = ?').run(last.content.slice(0, 100), last.sent_at, convId)
        } else {
          db.prepare('UPDATE conversations SET last_message = NULL, unread_count = 0, is_archived = 1 WHERE id = ?').run(convId)
        }
      }
    })()
    log('info', 'systeem', `Formulier-mails gesplitst (${account.name})`, { moved: plan.length, conversations: touched.size })
  }

  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(KEY, new Date().toISOString())
  console.log(`[email] Formulier-gesprekken gesplitst: ${moved} berichten verplaatst`)
}

// One-time cleanup: strip quoted history from email HTML stored before quotes were stripped on arrival
function stripQuotesFromStoredEmails() {
  const db = getDb()
  const KEY = 'email_quotes_stripped_v1'
  if (db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY)) return
  const rows = db.prepare(`SELECT id, email_html FROM messages WHERE channel = 'email' AND direction = 'inbound' AND email_html IS NOT NULL`).all() as Array<{ id: number; email_html: string }>
  const update = db.prepare('UPDATE messages SET email_html = ? WHERE id = ?')
  let changed = 0
  db.transaction(() => {
    for (const row of rows) {
      const stripped = stripQuotedHtml(row.email_html)
      if (stripped !== row.email_html) { update.run(stripped, row.id); changed++ }
    }
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(KEY, new Date().toISOString())
  })()
  console.log(`[email] Citaten verwijderd uit ${changed} van ${rows.length} opgeslagen emails`)
}
let pollingTimer: ReturnType<typeof setTimeout> | null = null

export function startEmailPolling() {
  if (pollingActive) return
  pollingActive = true
  try { stripQuotesFromStoredEmails() } catch (e) { console.error('[email] Citaten opschonen mislukt:', e) }
  splitFormConversations().catch(e => console.error('[email] Formulier-gesprekken splitsen mislukt:', e))
  pollEmails().catch(e => console.error('[email-poll] Startup error:', e))
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
    const accounts = getEnabledEmailAccounts()
    console.log(`[email-poll] Polling ${accounts.length} account(s)...`)
    for (const account of accounts) {
      try {
        // Timeout after 2 minutes to prevent hanging
        await Promise.race([
          fetchNewEmails(account),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout na 2 minuten')), 120000)),
        ])
        console.log(`[email-poll] ${account.name}: OK`)
      } catch (e) {
        console.error(`[email-poll] Fout bij ${account.name}:`, e instanceof Error ? e.message : String(e))
        log('error', 'systeem', `Email polling fout (${account.name})`, { error: e instanceof Error ? e.message : String(e), accountId: account.id })
      }
    }
  } catch (e) {
    console.error('[email-poll] Polling fout:', e instanceof Error ? e.message : String(e))
    log('error', 'systeem', 'Email polling fout', { error: e instanceof Error ? e.message : String(e) })
  }

  // Always reschedule
  if (pollingActive) {
    pollingTimer = setTimeout(pollEmails, 60000)
  }
}

async function fetchNewEmails(account: EmailAccount) {
  const { ImapFlow } = await import('imapflow')
  const { htmlToText } = await import('html-to-text')

  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_port === 993,
    ...(account.imap_port !== 993 ? { doSTARTTLS: true } : {}),
    auth: { user: account.imap_user, pass: account.imap_password },
    logger: false,
    tls: { rejectUnauthorized: false },
  })

  try {
    console.log(`[email-poll] ${account.name}: Verbinden met IMAP...`)
    await client.connect()
    console.log(`[email-poll] ${account.name}: Verbonden, mailbox "${account.imap_mailbox || 'INBOX'}" locken...`)
    const mailbox = account.imap_mailbox || 'INBOX'
    const lock = await client.getMailboxLock(mailbox)
    console.log(`[email-poll] ${account.name}: Lock verkregen, berichten ophalen...`)

    try {
      // Step 1: Quick search for unseen UIDs only (no source download).
      // Mail that arrived before poll_since is left untouched (stays unread in the mailbox).
      const unseen: Array<{ uid: number; internalDate?: Date | string }> = []
      for await (const msg of client.fetch({ seen: false }, { uid: true, internalDate: true })) {
        unseen.push({ uid: msg.uid, internalDate: msg.internalDate })
      }
      const unseenUids = selectNewUids(unseen, account.poll_since)
      console.log(`[email-poll] ${account.name}: ${unseen.length} ongelezen, ${unseenUids.length} nieuw sinds ${account.poll_since ?? 'begin'}`)

      if (unseenUids.length === 0) {
        lock.release()
        await client.logout()
        return
      }

      // Step 2: Mark ALL as seen immediately to prevent reprocessing
      if (unseenUids.length > 0) {
        await client.messageFlagsAdd(unseenUids.join(','), ['\\Seen'], { uid: true })
        console.log(`[email-poll] ${account.name}: Alle berichten als gelezen gemarkeerd`)
      }

      // Step 3: Fetch full source for each message individually (with per-message timeout)
      const fetchedMessages: Array<{ uid: number; envelope: Record<string, unknown>; source: Buffer }> = []
      for (const uid of unseenUids) {
        try {
          const fetched = await Promise.race([
            client.fetchOne(uid, { envelope: true, source: true }, { uid: true }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout bij ophalen uid=${uid}`)), 30000)),
          ])
          console.log(`[email-poll] ${account.name}: uid=${uid} opgehaald (${((fetched as unknown as { source: Buffer }).source?.length || 0) / 1024 | 0}KB)`)
          fetchedMessages.push({
            uid,
            envelope: (fetched as unknown as { envelope: Record<string, unknown> }).envelope,
            source: (fetched as unknown as { source: Buffer }).source,
          })
        } catch (e) {
          console.error(`[email-poll] ${account.name}: Overgeslagen uid=${uid}:`, e instanceof Error ? e.message : String(e))
        }
      }

      lock.release()
      await client.logout()
      console.log(`[email-poll] ${account.name}: IMAP gesloten, ${fetchedMessages.length} berichten verwerken...`)

      // Step 4: Process messages AFTER closing the IMAP connection
      for (const msg of fetchedMessages) {
        try {
          await processIncomingEmail(msg, htmlToText, account)
        } catch (e) {
          console.error(`[email-poll] Fout bij verwerken email uid=${msg.uid}:`, e instanceof Error ? e.message : String(e))
          log('error', 'systeem', 'Fout bij verwerken email', {
            error: e instanceof Error ? e.message : String(e),
            uid: msg.uid,
            account: account.name,
          })
        }
      }
    } catch (e) {
      lock.release()
      throw e
    }
  } catch (e) {
    log('error', 'systeem', `IMAP verbinding mislukt (${account.name})`, { error: e instanceof Error ? e.message : String(e) })
    try { await client.logout() } catch {}
  }
}

async function processIncomingEmail(
  msg: { uid: number; envelope?: Record<string, unknown>; source: Buffer },
  htmlToText: (html: string, options?: Record<string, unknown>) => string,
  account: EmailAccount
) {
  const envelope = msg.envelope || {} as Record<string, unknown>
  const fromList = (envelope.from || []) as Array<{ address?: string; name?: string }>
  const fromAddr = fromList[0]?.address?.toLowerCase() || ''
  const subject = (envelope.subject as string) || '(geen onderwerp)'
  const messageId = (envelope.messageId as string) || ''
  const inReplyTo = (envelope.inReplyTo as string) || ''

  // Extract CC addresses
  const ccList = (envelope.cc || []) as Array<{ address?: string; name?: string }>
  const emailCc = ccList.length > 0
    ? JSON.stringify(ccList.map(c => ({ address: c.address || '', name: c.name || '' })))
    : null

  console.log(`[email-poll] Verwerken uid=${msg.uid} van ${fromAddr}: ${subject}`)

  // Skip duplicates (already processed in a previous poll)
  if (messageId) {
    const db = getDb()
    const existing = db.prepare('SELECT id FROM messages WHERE email_message_id = ? LIMIT 1').get(messageId) as { id: number } | undefined
    if (existing) {
      console.log(`[email-poll] Overgeslagen: duplicaat message-id ${messageId}`)
      return
    }
  }

  // Skip emails from ourselves (any of our accounts)
  const allAccounts = getEmailAccounts()
  const ourAddresses = new Set(allAccounts.flatMap(a => [a.imap_user.toLowerCase(), a.smtp_user.toLowerCase()]))
  if (ourAddresses.has(fromAddr)) {
    console.log(`[email-poll] Overgeslagen: eigen adres ${fromAddr}`)
    return
  }

  // Website-form mail comes from the site address with the customer in Reply-To
  const customer = resolveCustomer(envelope as { from?: Array<{ address?: string; name?: string }>; replyTo?: Array<{ address?: string; name?: string }> }, ourAddresses)
  const customerAddr = customer.address
  const customerName = customer.name
  if (customerAddr !== fromAddr) console.log(`[email-poll] Klant via Reply-To: ${customerAddr} (afzender ${fromAddr})`)

  // Parse body from raw source
  const { simpleParser } = await import('mailparser')
  const parsed = await simpleParser(msg.source)

  // Sanitize and store HTML (limit to 100KB to avoid huge newsletters)
  let emailHtml: string | null = null
  if (parsed.html && typeof parsed.html === 'string' && parsed.html.length < 100_000) {
    emailHtml = await sanitizeEmailHtml(stripQuotedHtml(parsed.html))
  }

  // Extract plain text for storage and translation
  let body = parsed.text || ''
  if (!body && parsed.html) {
    body = htmlToText(parsed.html, { wordwrap: false })
  }
  if (!body) body = '(leeg bericht)'

  // Strip inline base64 data from plain text
  body = body.replace(/\[data:[^\]]{20,}\]/g, '[afbeelding]')
  body = body.replace(/data:[a-zA-Z/]+;base64,[A-Za-z0-9+/=]{20,}/g, '[afbeelding]')

  body = stripQuotedText(body)
  // Limit body size for translation
  if (body.length > 5000) body = body.slice(0, 5000) + '\n...(ingekort)'

  // Extract and save attachments
  const attachmentsMeta: Array<{ id: string; filename: string; size: number; contentType: string; allowed: boolean }> = []
  const attachmentsDir = path.join(path.dirname(process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'cs-assistant.db')), 'attachments')
  if (!fs.existsSync(attachmentsDir)) fs.mkdirSync(attachmentsDir, { recursive: true })

  for (const att of (parsed.attachments || [])) {
    const allowed = ALLOWED_ATTACHMENT_TYPES.has(att.contentType || '')
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const meta = {
      id,
      filename: att.filename || 'unnamed',
      size: att.size || 0,
      contentType: att.contentType || 'application/octet-stream',
      allowed,
    }

    // Save allowed attachments to disk
    if (allowed && att.content) {
      try {
        fs.writeFileSync(path.join(attachmentsDir, id), att.content)
      } catch (e) {
        console.error(`[email-poll] Bijlage opslaan mislukt: ${meta.filename}`, e instanceof Error ? e.message : String(e))
      }
    }

    attachmentsMeta.push(meta)
  }
  const emailAttachments = attachmentsMeta.length > 0 ? JSON.stringify(attachmentsMeta) : null

  const db = getDb()

  // Try to find existing conversation
  let convId: number | null = null

  // 1. Check by In-Reply-To header
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
    ).get(customerAddr) as { id: number } | undefined
    if (existingConv) convId = existingConv.id
  }

  // 3. Create new conversation
  if (!convId) {
    const result = db.prepare(`
      INSERT INTO conversations (customer_email, customer_name, updated_at, last_message, unread_count)
      VALUES (?, ?, CURRENT_TIMESTAMP, ?, 1)
    `).run(customerAddr, customerName || null, body.slice(0, 100))
    convId = result.lastInsertRowid as number

    log('info', 'bericht', `Nieuwe email-conversatie aangemaakt via ${account.name}`, { from: customerAddr, name: customerName }, convId)
  } else {
    db.prepare(`
      UPDATE conversations SET
        updated_at = CURRENT_TIMESTAMP,
        last_message = ?,
        unread_count = unread_count + 1,
        is_archived = 0
      WHERE id = ?
    `).run(body.slice(0, 100), convId)

    if (customerName) {
      db.prepare(`
        UPDATE conversations SET customer_name = ? WHERE id = ? AND customer_name IS NULL
      `).run(customerName, convId)
    }
  }

  // Detect language and translate
  let language = 'en'
  let dutchContent = body
  try {
    language = await detectLanguage(body, convId)
    dutchContent = await translateToDutch(body, language, convId)
    db.prepare('UPDATE conversations SET detected_language = ? WHERE id = ?').run(language, convId)
  } catch (e) {
    log('error', 'ai', 'Vertaling email mislukt', { error: e instanceof Error ? e.message : String(e), from: customerAddr }, convId)
  }

  // Save message with account reference
  db.prepare(`
    INSERT INTO messages (conversation_id, direction, content, content_dutch, language, status, channel, email_subject, email_message_id, email_in_reply_to, email_account_id, email_html, email_cc, email_attachments)
    VALUES (?, 'inbound', ?, ?, ?, 'received', 'email', ?, ?, ?, ?, ?, ?, ?)
  `).run(convId, body, dutchContent, language, subject, messageId, inReplyTo || null, account.id, emailHtml, emailCc, emailAttachments)

  try {
    const convRow = db.prepare('SELECT customer_name FROM conversations WHERE id = ?').get(convId) as { customer_name: string | null } | undefined
    const title = convRow?.customer_name || customerAddr
    await sendPushToAllDevices({
      title,
      body: dutchContent.slice(0, 140),
      url: `/?conversation=${convId}`,
      tag: `conv-${convId}`,
    })
  } catch (e) {
    log('error', 'push', 'Push verzenden na inbound email mislukt', { error: e instanceof Error ? e.message : String(e) }, convId ?? undefined)
  }

  log('info', 'bericht', `Email ontvangen via ${account.name} van ${customerAddr} (${language.toUpperCase()})`, { from: customerAddr, subject, account: account.name }, convId)

  tryAutoMerge(customerAddr, convId)
}

async function tryAutoMerge(email: string, emailConvId: number) {
  try {
    const { searchByEmail } = await import('./woocommerce')
    const orders = await searchByEmail(email)

    if (orders.length === 0) return

    const db = getDb()
    for (const order of orders) {
      const phone = order.billing.phone
      if (!phone) continue

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
          mergeConversations(whatsappConv.id, emailConvId)
          log('info', 'systeem', `Auto-merge: email-conversatie ${emailConvId} samengevoegd met WhatsApp-conversatie ${whatsappConv.id}`, { email, phone: variant })
          return
        }
      }
    }
  } catch (e) {
    log('error', 'systeem', 'Auto-merge mislukt', { error: e instanceof Error ? e.message : String(e), email })
  }
}

export function mergeConversations(keepId: number, mergeId: number) {
  const db = getDb()

  const keep = db.prepare('SELECT * FROM conversations WHERE id = ?').get(keepId) as Record<string, unknown> | undefined
  const merge = db.prepare('SELECT * FROM conversations WHERE id = ?').get(mergeId) as Record<string, unknown> | undefined

  if (!keep || !merge) throw new Error('Conversatie niet gevonden')

  // Move messages and orders to the keep conversation
  db.prepare('UPDATE messages SET conversation_id = ? WHERE conversation_id = ?').run(keepId, mergeId)
  try { db.prepare('UPDATE customer_orders SET conversation_id = ? WHERE conversation_id = ?').run(keepId, mergeId) } catch {}

  // Clear unique fields on merge conversation first to free them up
  db.prepare('UPDATE conversations SET customer_phone = NULL, customer_email = NULL WHERE id = ?').run(mergeId)

  // Fill in missing contact info on the keep conversation
  if (!keep.customer_email && merge.customer_email) {
    db.prepare('UPDATE conversations SET customer_email = ? WHERE id = ?').run(merge.customer_email, keepId)
  }
  if (!keep.customer_phone && merge.customer_phone) {
    db.prepare('UPDATE conversations SET customer_phone = ? WHERE id = ?').run(merge.customer_phone, keepId)
  }
  if (!keep.customer_name && merge.customer_name) {
    db.prepare('UPDATE conversations SET customer_name = ? WHERE id = ?').run(merge.customer_name, keepId)
  }

  db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(keepId)
  db.prepare('DELETE FROM conversations WHERE id = ?').run(mergeId)

  log('info', 'systeem', `Conversaties samengevoegd: ${mergeId} → ${keepId}`, { keepId, mergeId })
}
