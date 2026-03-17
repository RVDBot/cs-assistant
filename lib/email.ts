import { getDb, type EmailAccount } from './db'
import { detectLanguage, translateToDutch } from './claude'
import { log } from './logger'

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
    const accounts = getEnabledEmailAccounts()
    for (const account of accounts) {
      try {
        await fetchNewEmails(account)
      } catch (e) {
        log('error', 'systeem', `Email polling fout (${account.name})`, { error: e instanceof Error ? e.message : String(e), accountId: account.id })
      }
    }
  } catch (e) {
    log('error', 'systeem', 'Email polling fout', { error: e instanceof Error ? e.message : String(e) })
  }

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
          await processIncomingEmail(
            msg as unknown as { uid: number; envelope?: Record<string, unknown>; source: Buffer },
            htmlToText,
            account
          )
          await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true })
        } catch (e) {
          log('error', 'systeem', 'Fout bij verwerken email', {
            error: e instanceof Error ? e.message : String(e),
            uid: msg.uid,
            account: account.name,
          })
        }
      }
    } finally {
      lock.release()
    }

    await client.logout()
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

  // Skip emails from ourselves (any of our accounts)
  const allAccounts = getEmailAccounts()
  const ourAddresses = new Set(allAccounts.flatMap(a => [a.imap_user.toLowerCase(), a.smtp_user.toLowerCase()]))
  if (ourAddresses.has(fromAddr)) return

  // Parse body from raw source
  const { simpleParser } = await import('mailparser')
  const parsed = await simpleParser(msg.source)
  let body = parsed.text || ''
  if (!body && parsed.html) {
    body = htmlToText(parsed.html, { wordwrap: false })
  }
  if (!body) body = '(leeg bericht)'

  body = stripQuotedReply(body)

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
        unread_count = unread_count + 1
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
    INSERT INTO messages (conversation_id, direction, content, content_dutch, language, status, channel, email_subject, email_message_id, email_in_reply_to, email_account_id)
    VALUES (?, 'inbound', ?, ?, ?, 'received', 'email', ?, ?, ?, ?)
  `).run(convId, body, dutchContent, language, subject, messageId, inReplyTo || null, account.id)

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

  db.prepare('UPDATE messages SET conversation_id = ? WHERE conversation_id = ?').run(keepId, mergeId)
  db.prepare('UPDATE customer_orders SET conversation_id = ? WHERE conversation_id = ?').run(keepId, mergeId)

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
}
