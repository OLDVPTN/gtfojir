import fs from 'fs'
import path from 'path'

const DB_PATH = './data/gatofo-db.json'

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

export function readDb() {
  try {
    return ensureDb(JSON.parse(fs.readFileSync(DB_PATH, 'utf8')))
  } catch {
    return ensureDb({})
  }
}

export function writeDb(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  fs.writeFileSync(DB_PATH, JSON.stringify(ensureDb(db), null, 2))
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
