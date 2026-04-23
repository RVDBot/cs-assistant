import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(process.cwd(), 'data', 'cs-assistant.db')

const dir = path.dirname(DB_PATH)
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true })
}

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  initSchema(_db)
  return _db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_phone    TEXT UNIQUE,
      customer_email    TEXT UNIQUE,
      customer_name     TEXT,
      detected_language TEXT NOT NULL DEFAULT 'en',
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_message      TEXT,
      unread_count      INTEGER NOT NULL DEFAULT 0,
      CHECK (customer_phone IS NOT NULL OR customer_email IS NOT NULL)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id       INTEGER NOT NULL,
      direction             TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
      content               TEXT NOT NULL,
      content_dutch         TEXT,
      content_customer_lang TEXT,
      language              TEXT,
      sent_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status                TEXT NOT NULL DEFAULT 'received',
      twilio_sid            TEXT,
      reactions             TEXT NOT NULL DEFAULT '[]',
      channel               TEXT NOT NULL DEFAULT 'whatsapp',
      email_subject         TEXT,
      email_message_id      TEXT,
      email_in_reply_to     TEXT,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );


    CREATE TABLE IF NOT EXISTS context_files (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      content    TEXT NOT NULL,
      file_type  TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS context_links (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      url        TEXT NOT NULL UNIQUE,
      title      TEXT,
      content    TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tone_of_voice (
      id         INTEGER PRIMARY KEY CHECK(id = 1),
      prompt     TEXT NOT NULL DEFAULT '',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO tone_of_voice (id, prompt) VALUES (1, '');

    CREATE TABLE IF NOT EXISTS logs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      level           TEXT NOT NULL DEFAULT 'info',
      category        TEXT NOT NULL,
      message         TEXT NOT NULL,
      meta            TEXT,
      conversation_id INTEGER,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER,
      call_type       TEXT NOT NULL,
      input_tokens    INTEGER NOT NULL DEFAULT 0,
      output_tokens   INTEGER NOT NULL DEFAULT 0,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS customer_orders (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      wc_order_id     INTEGER NOT NULL,
      order_number    TEXT NOT NULL,
      customer_email  TEXT,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      UNIQUE(conversation_id, wc_order_id)
    );

    CREATE TABLE IF NOT EXISTS dismissed_orders (
      conversation_id INTEGER NOT NULL,
      wc_order_id     INTEGER NOT NULL,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      PRIMARY KEY (conversation_id, wc_order_id)
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint     TEXT NOT NULL UNIQUE,
      p256dh_key   TEXT NOT NULL,
      auth_key     TEXT NOT NULL,
      device_label TEXT,
      user_agent   TEXT,
      created_at   INTEGER NOT NULL,
      last_used_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_push_subs_endpoint ON push_subscriptions(endpoint);
  `)

  // Safe migrations for existing databases
  try { db.exec(`ALTER TABLE messages ADD COLUMN reactions TEXT NOT NULL DEFAULT '[]'`) } catch {}
  try { db.exec(`ALTER TABLE customer_orders ADD COLUMN order_data TEXT`) } catch {}
  try { db.exec(`ALTER TABLE customer_orders ADD COLUMN match_sources TEXT NOT NULL DEFAULT '[]'`) } catch {}

  // Email channel migrations
  try { db.exec(`ALTER TABLE conversations ADD COLUMN customer_email TEXT`) } catch {}
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_email ON conversations(customer_email) WHERE customer_email IS NOT NULL`) } catch {}

  // Make customer_phone nullable (required for email-only conversations)
  // SQLite cannot ALTER COLUMN, so we rebuild the table
  // Disable foreign keys during rebuild to prevent CASCADE deleting messages
  try {
    const phoneCol = db.prepare(`PRAGMA table_info(conversations)`).all() as { name: string; notnull: number }[]
    const phoneInfo = phoneCol.find(c => c.name === 'customer_phone')
    if (phoneInfo && phoneInfo.notnull === 1) {
      db.pragma('foreign_keys = OFF')
      db.exec(`
        CREATE TABLE conversations_new (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_phone    TEXT UNIQUE,
          customer_email    TEXT,
          customer_name     TEXT,
          detected_language TEXT NOT NULL DEFAULT 'en',
          created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_message      TEXT,
          unread_count      INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO conversations_new SELECT id, customer_phone, customer_email, customer_name, detected_language, created_at, updated_at, last_message, unread_count FROM conversations;
        DROP TABLE conversations;
        ALTER TABLE conversations_new RENAME TO conversations;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_email ON conversations(customer_email) WHERE customer_email IS NOT NULL;
      `)
      db.pragma('foreign_keys = ON')
    }
  } catch {
    try { db.pragma('foreign_keys = ON') } catch {}
  }
  try { db.exec(`ALTER TABLE messages ADD COLUMN channel TEXT NOT NULL DEFAULT 'whatsapp'`) } catch {}
  try { db.exec(`ALTER TABLE messages ADD COLUMN email_subject TEXT`) } catch {}
  try { db.exec(`ALTER TABLE messages ADD COLUMN email_message_id TEXT`) } catch {}
  try { db.exec(`ALTER TABLE messages ADD COLUMN email_in_reply_to TEXT`) } catch {}
  try { db.exec(`ALTER TABLE messages ADD COLUMN email_account_id INTEGER`) } catch {}
  try { db.exec(`ALTER TABLE messages ADD COLUMN email_html TEXT`) } catch {}
  try { db.exec(`ALTER TABLE messages ADD COLUMN email_cc TEXT`) } catch {}
  try { db.exec(`ALTER TABLE messages ADD COLUMN email_attachments TEXT`) } catch {}
  try { db.exec(`ALTER TABLE messages ADD COLUMN media_url TEXT`) } catch {}

  // Archive column
  try { db.exec(`ALTER TABLE conversations ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`) } catch {}

  // Manual language override flag
  try { db.exec(`ALTER TABLE conversations ADD COLUMN language_manual INTEGER NOT NULL DEFAULT 0`) } catch {}

  // WhatsApp template support
  try { db.exec(`ALTER TABLE conversations ADD COLUMN last_inbound_at DATETIME`) } catch {}
  try { db.exec(`ALTER TABLE messages ADD COLUMN template_id INTEGER`) } catch {}

  // Backfill last_inbound_at from existing inbound messages
  try {
    db.exec(`
      UPDATE conversations SET last_inbound_at = (
        SELECT MAX(sent_at) FROM messages
        WHERE messages.conversation_id = conversations.id
          AND messages.direction = 'inbound'
          AND messages.channel = 'whatsapp'
      ) WHERE last_inbound_at IS NULL
    `)
  } catch {}

  // WhatsApp templates tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS wa_templates (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      variables   TEXT NOT NULL DEFAULT '[]',
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wa_template_variants (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      language    TEXT NOT NULL,
      content_sid TEXT NOT NULL,
      preview     TEXT,
      FOREIGN KEY (template_id) REFERENCES wa_templates(id) ON DELETE CASCADE,
      UNIQUE(template_id, language)
    );
  `)

  // Email accounts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_accounts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      enabled     INTEGER NOT NULL DEFAULT 1,
      imap_host   TEXT NOT NULL DEFAULT 'imap.gmail.com',
      imap_port   INTEGER NOT NULL DEFAULT 993,
      imap_user   TEXT NOT NULL,
      imap_password TEXT NOT NULL,
      smtp_host   TEXT NOT NULL DEFAULT 'smtp.gmail.com',
      smtp_port   INTEGER NOT NULL DEFAULT 587,
      smtp_user   TEXT NOT NULL,
      smtp_password TEXT NOT NULL,
      from_name   TEXT NOT NULL DEFAULT 'SpeedRope Shop',
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Migrate old single-account settings to email_accounts table
  try {
    const oldUser = (db.prepare("SELECT value FROM settings WHERE key = 'email_imap_user'").get() as { value: string } | undefined)?.value
    if (oldUser) {
      const get = (k: string) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(k) as { value: string } | undefined)?.value || ''
      const exists = db.prepare('SELECT id FROM email_accounts WHERE imap_user = ?').get(oldUser)
      if (!exists) {
        db.prepare(`
          INSERT INTO email_accounts (name, enabled, imap_host, imap_port, imap_user, imap_password, smtp_host, smtp_port, smtp_user, smtp_password, from_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          get('email_from_name') || 'Google Workspace',
          get('email_enabled') === 'true' ? 1 : 0,
          get('email_imap_host') || 'imap.gmail.com',
          parseInt(get('email_imap_port') || '993', 10),
          oldUser,
          get('email_imap_password'),
          get('email_smtp_host') || 'smtp.gmail.com',
          parseInt(get('email_smtp_port') || '587', 10),
          get('email_smtp_user') || oldUser,
          get('email_smtp_password') || get('email_imap_password'),
          get('email_from_name') || 'SpeedRope Shop',
        )
      }
      // Clean up old settings
      for (const k of ['email_enabled', 'email_imap_host', 'email_imap_port', 'email_imap_user', 'email_imap_password', 'email_smtp_host', 'email_smtp_port', 'email_smtp_user', 'email_smtp_password', 'email_from_name']) {
        db.prepare('DELETE FROM settings WHERE key = ?').run(k)
      }
    }
  } catch {}
}

export interface EmailAccount {
  id: number
  name: string
  enabled: number
  imap_host: string
  imap_port: number
  imap_user: string
  imap_password: string
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_password: string
  from_name: string
  created_at: string
}

export interface Conversation {
  id: number
  customer_phone: string | null
  customer_email: string | null
  customer_name: string | null
  detected_language: string
  created_at: string
  updated_at: string
  last_message: string | null
  unread_count: number
  is_archived: number
  last_inbound_at: string | null
}

export interface Message {
  id: number
  conversation_id: number
  direction: 'inbound' | 'outbound'
  content: string
  content_dutch: string | null
  content_customer_lang: string | null
  language: string | null
  sent_at: string
  status: string
  twilio_sid: string | null
  channel: 'whatsapp' | 'email'
  email_subject: string | null
  email_message_id: string | null
  email_in_reply_to: string | null
  email_account_id: number | null
  email_html: string | null
  email_cc: string | null
  email_attachments: string | null
  media_url: string | null
  template_id: number | null
}

export interface ContextFile {
  id: number
  name: string
  content: string
  file_type: string | null
  created_at: string
}

export interface ContextLink {
  id: number
  url: string
  title: string | null
  content: string | null
  created_at: string
}

export interface PushSubscriptionRow {
  id: number
  endpoint: string
  p256dh_key: string
  auth_key: string
  device_label: string | null
  user_agent: string | null
  created_at: number
  last_used_at: number | null
}
