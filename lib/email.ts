import { getDb, type EmailAccount } from './db'
import { detectLanguage, translateToDutch } from './claude'
import { log } from './logger'
import { sendPushToAllDevices } from './push'
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
    await client.logout()
    imapOk = true
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
let pollingTimer: ReturnType<typeof setTimeout> | null = null

export function startEmailPolling() {
  if (pollingActive) return
  pollingActive = true
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
    console.log(`[email-poll] ${account.name}: Verbonden, mailbox locken...`)
    const lock = await client.getMailboxLock('INBOX')
    console.log(`[email-poll] ${account.name}: Lock verkregen, berichten ophalen...`)

    try {
      // Step 1: Quick search for unseen UIDs only (no source download)
      const unseenUids: number[] = []
      for await (const msg of client.fetch({ seen: false }, { uid: true })) {
        unseenUids.push(msg.uid)
      }
      console.log(`[email-poll] ${account.name}: ${unseenUids.length} ongelezen berichten gevonden`)

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
  const fromName = fromList[0]?.name || ''
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

  // Parse body from raw source
  const { simpleParser } = await import('mailparser')
  const parsed = await simpleParser(msg.source)

  // Sanitize and store HTML (limit to 100KB to avoid huge newsletters)
  let emailHtml: string | null = null
  if (parsed.html && typeof parsed.html === 'string' && parsed.html.length < 100_000) {
    emailHtml = await sanitizeEmailHtml(parsed.html)
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

  body = stripQuotedReply(body)
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

    log('info', 'bericht', `Nieuwe email-conversatie aangemaakt via ${account.name}`, { from: fromAddr, name: fromName }, convId)
  } else {
    db.prepare(`
      UPDATE conversations SET
        updated_at = CURRENT_TIMESTAMP,
        last_message = ?,
        unread_count = unread_count + 1,
        is_archived = 0
      WHERE id = ?
    `).run(body.slice(0, 100), convId)

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
    db.prepare('UPDATE conversations SET detected_language = ? WHERE id = ?').run(language, convId)
  } catch (e) {
    log('error', 'ai', 'Vertaling email mislukt', { error: e instanceof Error ? e.message : String(e), from: fromAddr }, convId)
  }

  // Save message with account reference
  db.prepare(`
    INSERT INTO messages (conversation_id, direction, content, content_dutch, language, status, channel, email_subject, email_message_id, email_in_reply_to, email_account_id, email_html, email_cc, email_attachments)
    VALUES (?, 'inbound', ?, ?, ?, 'received', 'email', ?, ?, ?, ?, ?, ?, ?)
  `).run(convId, body, dutchContent, language, subject, messageId, inReplyTo || null, account.id, emailHtml, emailCc, emailAttachments)

  try {
    const convRow = db.prepare('SELECT customer_name FROM conversations WHERE id = ?').get(convId) as { customer_name: string | null } | undefined
    const title = convRow?.customer_name || fromAddr
    await sendPushToAllDevices({
      title,
      body: dutchContent.slice(0, 140),
      url: `/?conversation=${convId}`,
      tag: `conv-${convId}`,
    })
  } catch (e) {
    log('error', 'push', 'Push verzenden na inbound email mislukt', { error: e instanceof Error ? e.message : String(e) }, convId ?? undefined)
  }

  log('info', 'bericht', `Email ontvangen via ${account.name} van ${fromAddr} (${language.toUpperCase()})`, { from: fromAddr, subject, account: account.name }, convId)

  tryAutoMerge(fromAddr, convId)
}

function stripQuotedReply(text: string): string {
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
