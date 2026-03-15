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
      customer_phone    TEXT NOT NULL UNIQUE,
      customer_name     TEXT,
      detected_language TEXT NOT NULL DEFAULT 'en',
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_message      TEXT,
      unread_count      INTEGER NOT NULL DEFAULT 0
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
  `)

  // Safe migrations for existing databases
  try { db.exec(`ALTER TABLE messages ADD COLUMN reactions TEXT NOT NULL DEFAULT '[]'`) } catch {}
}

export interface Conversation {
  id: number
  customer_phone: string
  customer_name: string | null
  detected_language: string
  created_at: string
  updated_at: string
  last_message: string | null
  unread_count: number
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
