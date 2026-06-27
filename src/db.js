import pg from 'pg'

const { Pool } = pg

const STATE_KEY = process.env.DB_STATE_KEY || 'main'
const TABLE_NAME = process.env.DB_TABLE_NAME || 'gatofo_state'
const SAVE_DEBOUNCE_MS = Number(process.env.DB_SAVE_DEBOUNCE_MS || 350)

let pool = null
let dbCache = null
let saveTimer = null
let lastSavePromise = Promise.resolve()
let dbMode = 'memory'
let dbLastError = ''

export function ensureDb(db = {}) {
  db.users ||= {}
  db.cards ||= []
  db.missions ||= []
  db.claims ||= []
  db.partnerCodes ||= []
  db.invites ||= []
  db.logs ||= []
  db.stats ||= {
    cardsOpened: 0,
    missionsCreated: 0,
    claims: 0,
    checkins: 0,
    estimatedGmv: 0
  }
  return db
}

function getInitialDb() {
  return ensureDb({})
}

function quoteIdent(value = '') {
  return `"${String(value).replace(/"/g, '""')}"`
}

function getSslConfig() {
  if (String(process.env.DATABASE_SSL || 'true').toLowerCase() === 'false') return false
  return { rejectUnauthorized: false }
}

export async function initDb() {
  dbCache = getInitialDb()

  if (!process.env.DATABASE_URL) {
    dbMode = 'memory'
    dbLastError = 'DATABASE_URL belum diisi. Data hanya tersimpan di memory runtime.'
    console.warn(`[DB] ${dbLastError}`)
    return dbCache
  }

  dbMode = 'postgres'
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: getSslConfig(),
    max: Number(process.env.DB_POOL_MAX || 3),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 20000)
  })

  const table = quoteIdent(TABLE_NAME)

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        key TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const existing = await pool.query(`SELECT data FROM ${table} WHERE key = $1 LIMIT 1`, [STATE_KEY])

    if (existing.rows[0]?.data) {
      dbCache = ensureDb(existing.rows[0].data)
    } else {
      dbCache = getInitialDb()
      await pool.query(
        `INSERT INTO ${table} (key, data) VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [STATE_KEY, JSON.stringify(dbCache)]
      )
    }

    dbLastError = ''
    console.log(`[DB] Connected to PostgreSQL. table=${TABLE_NAME}, key=${STATE_KEY}`)
    return dbCache
  } catch (error) {
    dbMode = 'memory'
    dbLastError = error.message
    console.error('[DB] PostgreSQL gagal, fallback ke memory:', error.message)
    return dbCache
  }
}

export function readDb() {
  return ensureDb(dbCache || getInitialDb())
}

async function persistNow() {
  if (!pool || dbMode !== 'postgres') return

  const data = JSON.stringify(ensureDb(dbCache || getInitialDb()))
  const table = quoteIdent(TABLE_NAME)

  try {
    await pool.query(
      `INSERT INTO ${table} (key, data) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [STATE_KEY, data]
    )
    dbLastError = ''
  } catch (error) {
    dbLastError = error.message
    console.error('[DB] Gagal menyimpan ke PostgreSQL:', error.message)
  }
}

function scheduleSave() {
  if (!pool || dbMode !== 'postgres') return

  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    lastSavePromise = persistNow()
  }, SAVE_DEBOUNCE_MS)
}

export function writeDb(db) {
  dbCache = ensureDb(db || dbCache || getInitialDb())
  scheduleSave()
}

export async function flushDb() {
  clearTimeout(saveTimer)
  saveTimer = null
  await lastSavePromise
  await persistNow()
}

export async function closeDb() {
  await flushDb()
  if (pool) await pool.end()
}

export function getDbStatus() {
  return {
    mode: dbMode,
    table: TABLE_NAME,
    key: STATE_KEY,
    connected: Boolean(pool && dbMode === 'postgres'),
    lastError: dbLastError
  }
}

export function getUser(db, phone, config = {}) {
  ensureDb(db)
  if (!db.users[phone]) {
    db.users[phone] = {
      phone,
      name: `UMKM ${String(phone).slice(-4)}`,
      role: 'guest',
      city: config.defaultCity || 'Malang',
      category: '',
      mood: '',
      step: '',
      pendingCardId: '',
      pendingPromo: '',
      pendingInviteId: '',
      pendingBusinessText: '',
      pendingBusinessName: '',
      pendingCity: '',
      pendingCategory: '',
      categoryConfidence: 0,
      categorySource: '',
      categoryReason: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }
  return db.users[phone]
}

export function log(db, phone, type, text) {
  ensureDb(db)
  db.logs.unshift({
    id: `LOG_${Math.random().toString(16).slice(2, 10).toUpperCase()}`,
    phone,
    type,
    text: String(text || '').slice(0, 2000),
    createdAt: new Date().toISOString()
  })
  db.logs = db.logs.slice(0, 250)
}
