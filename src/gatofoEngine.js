import config from '../settings.js'
import { getUser, log, writeDb } from './db.js'
import { sendText, sendButtons, sendList } from './wa.js'
import { getOllamaStatus, generateWithOllama, classifyBusinessWithOllama } from './ollama.js'

const CARD_CATALOG = {
  sepi: {
    code: 'PUNKATT_BURNOUT',
    name: 'Punkatt Burnout',
    rarity: 'common',
    family: 'Punkatt',
    hook: 'Bikin traffic cepat tanpa promo ribet.'
  },
  ramai: {
    code: 'PUNKATT_CROWD',
    name: 'Punkatt Crowd Mode',
    rarity: 'rare',
    family: 'Punkatt',
    hook: 'Ubah keramaian jadi repeat order.'
  },
  stok: {
    code: 'GATOZOMBIE_DROP',
    name: 'Gatozombie Stock Drop',
    rarity: 'common',
    family: 'Gatozombie',
    hook: 'Bangkitkan stok numpuk jadi campaign terbatas.'
  },
  promo: {
    code: 'GATOWITCH_CHARM',
    name: 'Gatowitch Charm',
    rarity: 'rare',
    family: 'Gatowitch',
    hook: 'Bikin promo terasa punya cerita.'
  },
  kolab: {
    code: 'PUNKATT_COLLAB',
    name: 'Punkatt Collab Spark',
    rarity: 'epic',
    family: 'Punkatt',
    hook: 'Buka jalur kolaborasi antar-UMKM.'
  }
}

const MOODS = {
  sepi: {
    label: 'Sepi, butuh pelanggan cepat',
    missionLabel: 'Flash Mission',
    durationHours: 72,
    cardKey: 'sepi'
  },
  ramai: {
    label: 'Ramai, mau repeat order',
    missionLabel: 'Peak Bridge Mission',
    durationHours: 168,
    cardKey: 'ramai'
  },
  stok: {
    label: 'Stok numpuk',
    missionLabel: 'Stock Drop Mission',
    durationHours: 72,
    cardKey: 'stok'
  },
  promo: {
    label: 'Bingung bikin promo',
    missionLabel: 'Creative Mission',
    durationHours: 72,
    cardKey: 'promo'
  },
  kolab: {
    label: 'Mau kolaborasi',
    missionLabel: 'Collab Season',
    durationHours: 336,
    cardKey: 'kolab'
  }
}

const now = () => new Date().toISOString()
const id = prefix => `${prefix}_${Math.random().toString(16).slice(2, 10).toUpperCase()}`
const upper = text => String(text || '').trim().toUpperCase()
const clean = text => String(text || '').trim()
const hoursFromNow = hours => new Date(Date.now() + Number(hours || 1) * 60 * 60 * 1000).toISOString()
const phoneSuffix = phone => String(phone || '').slice(-4)
const rupiah = value => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0)

function detectCity(text = '') {
  const cities = ['Malang', 'Surabaya', 'Sidoarjo', 'Jakarta', 'Bandung', 'Yogyakarta', 'Jogja', 'Semarang', 'Solo', 'Bali', 'Denpasar', 'Bogor', 'Depok', 'Tangerang', 'Bekasi']
  const q = String(text || '').toLowerCase()
  return cities.find(city => q.includes(city.toLowerCase())) || config.defaultCity || 'Malang'
}

const CATEGORY_OPTIONS = {
  makanan: 'Makanan',
  minuman: 'Minuman',
  dessert: 'Dessert / Roti',
  cafe: 'Cafe',
  fashion: 'Fashion / Thrift',
  jasa: 'Jasa',
  lainnya: 'Lainnya'
}

const CATEGORY_THRESHOLD = Number(config.categoryConfidenceThreshold || 0.72)

const KNOWN_BRAND_HINTS = [
  { pattern: /the\s*harvest/i, category: 'Dessert / Roti', confidence: 0.82, reason: 'Brand hint: dikenal sebagai toko cake/dessert' },
  { pattern: /fore\b|janji\s*jiwa|kopi\s*kenangan|tuku\b/i, category: 'Minuman', confidence: 0.80, reason: 'Brand hint: dikenal sebagai minuman/kopi' },
  { pattern: /gacoan|solaria|hokben|richeese|sederhana/i, category: 'Makanan', confidence: 0.80, reason: 'Brand hint: dikenal sebagai makanan' },
  { pattern: /barber|barbershop|pangkas/i, category: 'Jasa', confidence: 0.88, reason: 'Keyword jasa/barber' }
]

function classifyCategoryLocal(text = '') {
  const q = String(text || '').toLowerCase()
  const checks = [
    { category: 'Makanan', confidence: 0.92, reason: 'Ada keyword makanan', regex: /geprek|ayam|mie|bakso|nasi|warung|makan|kuliner|seblak|soto|rawon|lalapan|pecel|bebek|sate|martabak|burger|pizza|dimsum/ },
    { category: 'Minuman', confidence: 0.92, reason: 'Ada keyword minuman', regex: /es teh|minum|minuman|kopi|coffee|boba|jus|drink|susu|thai tea|matcha|latte/ },
    { category: 'Dessert / Roti', confidence: 0.93, reason: 'Ada keyword dessert/roti/kue', regex: /roti|bakery|donat|cake|kue|dessert|manis|pastry|brownies|puding|pudding|tart|croissant/ },
    { category: 'Cafe', confidence: 0.88, reason: 'Ada keyword cafe/kafe/nongkrong', regex: /cafe|kafe|coffee shop|nongkrong|coffeeshop|kedai kopi/ },
    { category: 'Fashion / Thrift', confidence: 0.90, reason: 'Ada keyword fashion/thrift', regex: /baju|fashion|thrift|sepatu|kaos|hoodie|dress|celana|sneakers|outfit/ },
    { category: 'Jasa', confidence: 0.90, reason: 'Ada keyword jasa/service', regex: /barber|laundry|salon|cukur|service|jasa|repair|bengkel|cuci|printing|fotokopi/ }
  ]

  for (const check of checks) {
    if (check.regex.test(q)) return { category: check.category, confidence: check.confidence, source: 'keyword', reason: check.reason }
  }

  for (const hint of KNOWN_BRAND_HINTS) {
    if (hint.pattern.test(q)) return { category: hint.category, confidence: hint.confidence, source: 'brand_hint', reason: hint.reason }
  }

  return { category: 'Belum yakin', confidence: 0.25, source: 'unknown', reason: 'Tidak ada keyword kategori yang jelas' }
}

async function classifyBusiness(text = '') {
  const local = classifyCategoryLocal(text)
  if (local.confidence >= CATEGORY_THRESHOLD) return local

  if (config.useOllamaForCategory === false) return local

  try {
    const ai = await classifyBusinessWithOllama(text)
    if (ai?.category && ai.category !== 'unknown') {
      const categoryMap = {
        makanan: 'Makanan',
        food: 'Makanan',
        minuman: 'Minuman',
        drink: 'Minuman',
        beverage: 'Minuman',
        dessert: 'Dessert / Roti',
        roti: 'Dessert / Roti',
        bakery: 'Dessert / Roti',
        kue: 'Dessert / Roti',
        cafe: 'Cafe',
        fashion: 'Fashion / Thrift',
        thrift: 'Fashion / Thrift',
        jasa: 'Jasa',
        service: 'Jasa',
        lainnya: 'Lainnya',
        other: 'Lainnya'
      }
      const normalizedKey = String(ai.category || '').toLowerCase().trim()
      const category = categoryMap[normalizedKey] || ai.category
      const confidence = Number(ai.confidence || 0)
      return {
        category,
        confidence: Math.max(0, Math.min(1, confidence)),
        source: 'ollama',
        reason: ai.reason || 'Klasifikasi dari Ollama',
        aiRaw: ai
      }
    }
  } catch (error) {
    return { ...local, source: 'keyword_fallback', reason: `${local.reason}; Ollama gagal: ${error.message}` }
  }

  return local
}

function shouldAskCategory(classification) {
  if (!classification) return true
  const category = String(classification.category || '').trim().toLowerCase()
  if (!category || category === 'belum yakin' || category === 'umkm' || category === 'unknown') return true
  if (Number(classification.confidence || 0) < CATEGORY_THRESHOLD) return true

  // Brand hints are useful as suggestions, but should still be confirmed
  // if user did not mention the actual product/menu.
  if (classification.source === 'brand_hint') return true

  return false
}

function mapCategoryChoice(text = '') {
  const q = upper(text).trim()

  // ID dari button/list
  if (q.includes('CATEGORY_MAKANAN')) return 'Makanan'
  if (q.includes('CATEGORY_MINUMAN')) return 'Minuman'
  if (q.includes('CATEGORY_DESSERT') || q.includes('CATEGORY_ROTI')) return 'Dessert / Roti'
  if (q.includes('CATEGORY_CAFE')) return 'Cafe'
  if (q.includes('CATEGORY_FASHION')) return 'Fashion / Thrift'
  if (q.includes('CATEGORY_JASA')) return 'Jasa'
  if (q.includes('CATEGORY_LAINNYA')) return 'Lainnya'

  // Fallback jika WhatsApp/Baileys mengirim title row, bukan ID.
  if (/^1\b/.test(q) || /\bMAKANAN\b|FOOD|KULINER|WARUNG|GEPREK|BAKSO|MIE/.test(q)) return 'Makanan'
  if (/^2\b/.test(q) || /\bMINUMAN\b|DRINK|BEVERAGE|KOPI|BOBA|JUS|ES TEH/.test(q)) return 'Minuman'
  if (/^3\b/.test(q) || /\bDESSERT\b|ROTI|KUE|CAKE|BAKERY|DONAT/.test(q)) return 'Dessert / Roti'
  if (/^4\b/.test(q) || /\bCAFE\b|KAFE|COFFEE SHOP|NONGKRONG/.test(q)) return 'Cafe'
  if (/^5\b/.test(q) || /\bFASHION\b|THRIFT|BAJU|SEPATU|AKSESORIS/.test(q)) return 'Fashion / Thrift'
  if (/^6\b/.test(q) || /\bJASA\b|SERVICE|BARBER|LAUNDRY|SALON/.test(q)) return 'Jasa'
  if (/^7\b/.test(q) || /\bLAINNYA\b|OTHER/.test(q)) return 'Lainnya'

  return ''
}

function detectName(text = '', phone = '') {
  let name = clean(text)
  const city = detectCity(text)
  name = name.replace(new RegExp(city, 'ig'), '').trim()

  // Kalau user menulis deskripsi seperti:
  // "The Harvest Malang jual kue ulang tahun"
  // bagian setelah kata jual/menjual/produk dipakai untuk klasifikasi, bukan nama usaha.
  name = name.split(/\b(jual|menjual|produk|menyediakan|spesialis|kategori|usaha)\b/i)[0].trim()

  name = name.replace(/\s+/g, ' ')
  return name || `UMKM ${phoneSuffix(phone)}`
}

function mapMood(text, step = '') {
  const q = upper(text)
  if (step === 'mood') {
    if (q === '1') return 'sepi'
    if (q === '2') return 'ramai'
    if (q === '3') return 'stok'
    if (q === '4') return 'promo'
    if (q === '5') return 'kolab'
  }
  if (q.includes('GATOFO_MOOD_SEPI') || q === 'SEPI') return 'sepi'
  if (q.includes('GATOFO_MOOD_RAMAI') || q === 'RAMAI' || q === 'RAME') return 'ramai'
  if (q.includes('GATOFO_MOOD_STOK') || q === 'STOK') return 'stok'
  if (q.includes('GATOFO_MOOD_PROMO') || q === 'PROMO') return 'promo'
  if (q.includes('GATOFO_MOOD_KOLAB') || q === 'KOLAB' || q === 'KOLABORASI') return 'kolab'
  return ''
}

function promoExamples(user) {
  if (user.mood === 'ramai') {
    return [
      'Voucher kunjungan berikutnya untuk pelanggan Gatofo',
      'Promo khusus jam sepi / off-peak',
      'Bonus produk pilihan untuk pembelian berikutnya'
    ]
  }

  if (/roti|dessert/i.test(user.category)) {
    return [
      'Diskon 10% roti/dessert pilihan',
      'Paket hemat dessert khusus Gatofo',
      'Bonus item kecil untuk pembelian tertentu'
    ]
  }

  if (/minuman/i.test(user.category)) {
    return [
      'Diskon 10% minuman pilihan',
      'Beli 2 minuman lebih hemat',
      'Bonus topping / es teh'
    ]
  }

  if (/cafe/i.test(user.category)) {
    return [
      'Paket meeting / nongkrong khusus Gatofo',
      'Happy hour khusus jam sepi',
      'Bonus snack kecil'
    ]
  }

  return [
    'Gratis es teh / bonus kecil untuk pembelian paket utama',
    'Diskon 10% untuk pelanggan Gatofo',
    'Paket hemat khusus pelanggan Gatofo'
  ]
}

function openCard(db, phone, moodKey) {
  const mood = MOODS[moodKey] || MOODS.sepi
  const catalog = CARD_CATALOG[mood.cardKey] || CARD_CATALOG.sepi
  const rarityBonus = catalog.rarity === 'epic' ? 90 : catalog.rarity === 'rare' ? 45 : 0
  const card = {
    id: id('CARD'),
    ownerPhone: phone,
    code: catalog.code,
    name: catalog.name,
    family: catalog.family,
    rarity: catalog.rarity,
    hook: catalog.hook,
    pr: 25 + Math.floor(Math.random() * 26) + rarityBonus,
    used: false,
    createdAt: now()
  }
  db.cards.unshift(card)
  db.stats.cardsOpened += 1
  return card
}

function latestMission(db, phone) {
  return db.missions.find(mission => mission.merchantPhone === phone && mission.status === 'active' && new Date(mission.expiresAt).getTime() > Date.now())
}

function activeMissions(db) {
  return db.missions.filter(mission => mission.status === 'active' && mission.prRemaining > 0 && new Date(mission.expiresAt).getTime() > Date.now())
}

export async function startFlow(sock, jid, quoted, db, user) {
  user.step = 'mood'
  user.updatedAt = now()
  writeDb(db)

  return sendButtons(sock, jid, [
    `👋 Halo! Ini *${config.botName}*.`,
    '',
    'Mau bantu usaha kamu hari ini dengan campaign simpel.',
    '',
    '*Kondisi usahamu sekarang?*',
    '',
    '1. Sepi, butuh pelanggan cepat',
    '2. Ramai, mau repeat order',
    '3. Stok numpuk',
    '4. Bingung bikin promo',
    '5. Mau kolaborasi',
    '',
    'Tap tombol atau balas angka.'
  ].join('\n'), [
    { text: 'Sepi', id: 'GATOFO_MOOD_SEPI' },
    { text: 'Ramai', id: 'GATOFO_MOOD_RAMAI' },
    { text: 'Lainnya', id: 'GATOFO_MOOD_MORE' }
  ], quoted, config.footer)
}

async function moreMood(sock, jid, quoted) {
  return sendButtons(sock, jid, [
    '*Pilih kondisi lainnya:*',
    '',
    '3. Stok numpuk',
    '4. Bingung bikin promo',
    '5. Mau kolaborasi'
  ].join('\n'), [
    { text: 'Stok', id: 'GATOFO_MOOD_STOK' },
    { text: 'Promo', id: 'GATOFO_MOOD_PROMO' },
    { text: 'Kolab', id: 'GATOFO_MOOD_KOLAB' }
  ], quoted, config.footer)
}

async function selectMood(sock, jid, quoted, db, user, moodKey) {
  user.mood = moodKey
  user.role = 'merchant'
  user.step = 'business'
  user.updatedAt = now()
  writeDb(db)

  const mood = MOODS[moodKey] || MOODS.sepi
  return sendButtons(sock, jid, [
    `🧭 Mood: *${mood.label}*`,
    `Mission: *${mood.missionLabel}*`,
    '',
    'Sekarang cukup kirim *nama usaha + kota*.',
    '',
    'Contoh:',
    '*Geprek Kobong Malang*',
    '',
    'Gatofo akan deteksi kategori otomatis.'
  ].join('\n'), [
    { text: 'Lewati', id: 'GATOFO_SKIP_BUSINESS' },
    { text: 'Contoh', id: 'GATOFO_EXAMPLE_BUSINESS' }
  ], quoted, config.footer)
}

async function askCategoryConfirmation(sock, jid, quoted, db, user, classification) {
  user.step = 'confirm_category'
  user.pendingCategory = classification.category || ''
  user.categoryConfidence = classification.confidence || 0
  user.categorySource = classification.source || 'unknown'
  user.categoryReason = classification.reason || ''
  user.updatedAt = now()
  writeDb(db)

  return sendList(sock, jid, [
    'Aku belum 100% yakin kategori usaha kamu.',
    '',
    `Usaha: *${user.pendingBusinessName || user.name}*`,
    `Area: ${user.pendingCity || user.city}`,
    classification.category && classification.category !== 'Belum yakin'
      ? `Tebakan sistem: ${classification.category} (${Math.round((classification.confidence || 0) * 100)}%)`
      : 'Tebakan sistem: belum yakin',
    classification.reason ? `Alasan: ${classification.reason}` : '',
    '',
    'Tolong validasi kategori dulu agar campaign-nya tidak salah sasaran.'
  ].filter(Boolean).join('\n'), 'Pilih Kategori', [
    { title: '1. Makanan', description: 'Geprek, mie, bakso, nasi, snack berat', id: 'GATOFO_CATEGORY_MAKANAN' },
    { title: '2. Minuman', description: 'Es teh, kopi, boba, jus', id: 'GATOFO_CATEGORY_MINUMAN' },
    { title: '3. Dessert / Roti / Kue', description: 'Cake, bakery, dessert, donat', id: 'GATOFO_CATEGORY_DESSERT' },
    { title: '4. Cafe', description: 'Cafe, tempat nongkrong, coffee shop', id: 'GATOFO_CATEGORY_CAFE' },
    { title: '5. Fashion / Thrift', description: 'Baju, sepatu, aksesoris', id: 'GATOFO_CATEGORY_FASHION' },
    { title: '6. Jasa', description: 'Barber, laundry, salon, service', id: 'GATOFO_CATEGORY_JASA' },
    { title: '7. Lainnya', description: 'Kategori selain pilihan di atas', id: 'GATOFO_CATEGORY_LAINNYA' }
  ], quoted, config.footer)
}

async function sendMysteryBoxAndPromo(sock, jid, quoted, db, user, phone) {
  const mood = MOODS[user.mood] || MOODS.sepi
  const card = openCard(db, phone, user.mood || 'sepi')
  user.pendingCardId = card.id
  user.step = 'promo'
  user.updatedAt = now()
  writeDb(db)

  const examples = promoExamples(user)
  return sendButtons(sock, jid, [
    '🎁 *Mystery Box terbuka!*',
    '',
    `Usaha: *${user.name}*`,
    `Area: ${user.city}`,
    `Kategori: ${user.category}`,
    user.categoryConfidence ? `Confidence: ${Math.round(user.categoryConfidence * 100)}% (${user.categorySource || 'system'})` : '',
    '',
    `Kartu: *${card.name}*`,
    `Rarity: ${card.rarity.toUpperCase()}`,
    `PR: ${card.pr} Potential Reach`,
    `Mode: ${mood.missionLabel}`,
    '',
    '*Contoh:*',
    ...examples.map(item => `• ${item}`),
    '',
    'Tap *Kustom Promo*, lalu tulis promo yang benar-benar mau kamu pakai.'
  ].filter(Boolean).join('\n'), [
    { text: 'Kustom Promo', id: 'GATOFO_CUSTOM_PROMO' },
    { text: 'Batal', id: 'GATOFO_CANCEL' }
  ], quoted, config.footer)
}

async function openBoxAndAskPromo(sock, jid, quoted, db, user, phone, businessText = '') {
  if (businessText && !businessText.startsWith('GATOFO_')) {
    const city = detectCity(businessText)
    const name = detectName(businessText, phone)
    const classification = await classifyBusiness(businessText)

    user.pendingBusinessText = businessText
    user.pendingBusinessName = name
    user.pendingCity = city
    user.categoryConfidence = classification.confidence || 0
    user.categorySource = classification.source || 'unknown'
    user.categoryReason = classification.reason || ''
    user.updatedAt = now()

    if (shouldAskCategory(classification)) {
      user.name = name
      user.city = city
      writeDb(db)
      return askCategoryConfirmation(sock, jid, quoted, db, user, classification)
    }

    user.name = name
    user.city = city
    user.category = classification.category
  } else if (!user.name || /^UMKM /.test(user.name)) {
    user.name = `UMKM ${phoneSuffix(phone)}`
    user.city = user.city || config.defaultCity || 'Malang'
    user.category = ''
    user.categoryConfidence = 0
    user.categorySource = 'skip'
    user.pendingBusinessName = user.name
    user.pendingCity = user.city
    writeDb(db)
    return askCategoryConfirmation(sock, jid, quoted, db, user, {
      category: 'Belum yakin',
      confidence: 0,
      source: 'skip',
      reason: 'User melewati input nama/kategori'
    })
  }

  if (!user.category || String(user.category).toLowerCase() === 'umkm') {
    return askCategoryConfirmation(sock, jid, quoted, db, user, {
      category: 'Belum yakin',
      confidence: 0,
      source: 'missing_category',
      reason: 'Kategori belum valid'
    })
  }

  return sendMysteryBoxAndPromo(sock, jid, quoted, db, user, phone)
}

async function confirmCategoryAndOpenBox(sock, jid, quoted, db, user, phone, category) {
  if (!category) return askCategoryConfirmation(sock, jid, quoted, db, user, {
    category: user.pendingCategory || 'Belum yakin',
    confidence: user.categoryConfidence || 0,
    source: user.categorySource || 'unknown',
    reason: user.categoryReason || ''
  })

  user.name = user.pendingBusinessName || user.name || `UMKM ${phoneSuffix(phone)}`
  user.city = user.pendingCity || user.city || config.defaultCity || 'Malang'
  user.category = category
  user.categoryConfidence = 1
  user.categorySource = 'user_confirmed'
  user.categoryReason = 'Kategori dipilih langsung oleh owner'
  user.pendingBusinessText = ''
  user.pendingBusinessName = ''
  user.pendingCity = ''
  user.pendingCategory = ''
  user.updatedAt = now()
  writeDb(db)

  return sendMysteryBoxAndPromo(sock, jid, quoted, db, user, phone)
}

async function askCustomPromo(sock, jid, quoted, db, user) {
  user.step = 'custom_promo'
  user.updatedAt = now()
  writeDb(db)

  return sendText(sock, jid, [
    '*Tulis promo kamu secara singkat.*',
    '',
    'Contoh:',
    '• Diskon 10% cake ukuran 20 cm khusus hari ini',
    '• Gratis es teh untuk pembelian paket geprek',
    '• Beli 2 minuman, hemat Rp5.000',
    '',
    'Ketik promo yang ingin dipakai.'
  ].join('\n'), quoted)
}

async function saveCustomPromo(sock, jid, quoted, db, user, text) {
  const promo = clean(text)
  if (!promo || promo.startsWith('GATOFO_')) return askCustomPromo(sock, jid, quoted, db, user)
  if (promo.length < 5) return sendText(sock, jid, 'Promonya terlalu pendek. Contoh: Diskon 10% cake ukuran 20 cm.', quoted)

  user.pendingPromo = promo
  user.step = 'confirm'
  user.updatedAt = now()
  writeDb(db)

  return sendButtons(sock, jid, [
    '✅ *Campaign siap dibuat.*',
    '',
    `Usaha: ${user.name}`,
    `Area: ${user.city}`,
    `Kategori: ${user.category}`,
    `Promo: ${promo}`,
    '',
    'Aktifkan sekarang?'
  ].join('\n'), [
    { text: 'Pakai', id: 'GATOFO_USE' },
    { text: 'Batal', id: 'GATOFO_CANCEL' }
  ], quoted, config.footer)
}

async function activateMission(sock, jid, quoted, db, user, phone) {
  const card = db.cards.find(item => item.id === user.pendingCardId && item.ownerPhone === phone && !item.used)
  if (!card) return sendText(sock, jid, 'Kartu tidak ditemukan. Ketik MULAI untuk mulai ulang.', quoted)

  const mood = MOODS[user.mood] || MOODS.sepi
  const mission = {
    id: id('MISSION'),
    merchantPhone: phone,
    merchantName: user.name || `UMKM ${phoneSuffix(phone)}`,
    city: user.city || config.defaultCity || 'Malang',
    category: user.category || 'UMKM',
    mood: user.mood || 'sepi',
    missionLabel: mood.missionLabel,
    promo: user.pendingPromo || 'Promo spesial Gatofo',
    cardId: card.id,
    cardName: card.name,
    cardFamily: card.family,
    prTarget: card.pr,
    prRemaining: card.pr,
    claims: 0,
    checkins: 0,
    status: 'active',
    relationMode: 'solo',
    createdAt: now(),
    expiresAt: hoursFromNow(mood.durationHours)
  }

  card.used = true
  db.missions.unshift(mission)
  db.stats.missionsCreated += 1
  user.step = ''
  user.pendingCardId = ''
  user.pendingPromo = ''
  user.updatedAt = now()
  writeDb(db)

  const botNumber = String(config.botNumber || '').replace(/[^0-9]/g, '') || 'nomorbot'
  const link = `https://wa.me/${botNumber}?text=${encodeURIComponent(`CARI ${mission.category} ${mission.city}`)}`

  return sendButtons(sock, jid, [
    '🔥 *Campaign aktif!*',
    '',
    `ID: ${mission.id}`,
    `Mission: ${mission.missionLabel}`,
    `Mode: ${mission.relationMode}`,
    `Promo: ${mission.promo}`,
    `PR: ${mission.prRemaining}`,
    `Berlaku sampai: ${new Date(mission.expiresAt).toLocaleString('id-ID')}`,
    '',
    '*Share link ini:*',
    link,
    '',
    '*Caption:*',
    `Lagi cari promo ${mission.category} di ${mission.city}? Claim voucher Gatofo sekarang 🔥`,
    '',
    'Kasir validasi dengan:',
    '*CHECKIN KODE*'
  ].join('\n'), [
    { text: 'AI Promo', id: 'GATOFO_AI_PROMO' },
    { text: 'Partner', id: 'GATOFO_PARTNER' },
    { text: 'Rekap', id: 'GATOFO_REKAP' }
  ], quoted, config.footer)
}

async function searchMission(sock, jid, quoted, db, text) {
  const query = clean(text.replace(/^CARI/i, '')).toLowerCase()
  const found = activeMissions(db)
    .map(mission => {
      const hay = `${mission.merchantName} ${mission.city} ${mission.category} ${mission.promo} ${mission.missionLabel}`.toLowerCase()
      let score = 0
      for (const part of query.split(/\s+/).filter(Boolean)) if (hay.includes(part)) score += 1
      return { mission, score }
    })
    .filter(item => !query || item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  if (!found.length) return sendText(sock, jid, 'Belum ada promo yang cocok. Coba: CARI makanan Malang.', quoted)

  return sendList(sock, jid, `Hasil Gatofo untuk: *${query || 'promo'}*`, 'Pilih Voucher', found.map(({ mission }) => ({
    title: mission.merchantName,
    description: `${mission.promo} • PR ${mission.prRemaining}`,
    id: `GATOFO_CLAIM_${mission.id}`
  })), quoted, config.footer)
}

async function claimMission(sock, jid, quoted, db, phone, missionId) {
  const mission = db.missions.find(item => item.id === missionId && item.status === 'active')
  if (!mission) return sendText(sock, jid, 'Mission tidak ditemukan atau sudah selesai.', quoted)
  if (mission.prRemaining <= 0) return sendText(sock, jid, 'PR mission ini sudah habis.', quoted)

  const existing = db.claims.find(item => item.missionId === mission.id && item.customerPhone === phone && item.status === 'claimed')
  if (existing) return sendText(sock, jid, `Kamu sudah claim. Kode: *${existing.code}*`, quoted)

  const claim = {
    id: id('CLAIM'),
    code: Math.random().toString(16).slice(2, 8).toUpperCase(),
    missionId: mission.id,
    customerPhone: phone,
    merchantPhone: mission.merchantPhone,
    merchantName: mission.merchantName,
    promo: mission.promo,
    status: 'claimed',
    createdAt: now(),
    expiresAt: hoursFromNow(mission.mood === 'ramai' ? 168 : 24)
  }
  db.claims.unshift(claim)
  mission.prRemaining -= 1
  mission.claims += 1
  db.stats.claims += 1
  writeDb(db)

  return sendText(sock, jid, [
    '✅ *Voucher berhasil di-claim!*',
    '',
    `Kode: *${claim.code}*`,
    `UMKM: ${mission.merchantName}`,
    `Promo: ${mission.promo}`,
    `Berlaku sampai: ${new Date(claim.expiresAt).toLocaleString('id-ID')}`,
    '',
    'Tunjukkan kode ini ke kasir.'
  ].join('\n'), quoted)
}

async function checkin(sock, jid, quoted, db, phone, text) {
  const code = upper(text).split(/\s+/)[1]
  if (!code) return sendText(sock, jid, 'Masukkan kode. Contoh: CHECKIN ABC123', quoted)

  const claim = db.claims.find(item => item.code === code)
  if (!claim) return sendText(sock, jid, 'Kode voucher tidak ditemukan.', quoted)
  if (claim.merchantPhone !== phone) return sendText(sock, jid, 'Kode ini bukan untuk UMKM kamu.', quoted)
  if (claim.status === 'checked_in') return sendText(sock, jid, 'Kode ini sudah pernah check-in.', quoted)
  if (new Date(claim.expiresAt).getTime() < Date.now()) return sendText(sock, jid, 'Kode ini sudah kedaluwarsa.', quoted)

  const mission = db.missions.find(item => item.id === claim.missionId)
  claim.status = 'checked_in'
  claim.checkedInAt = now()
  if (mission) mission.checkins += 1
  db.stats.checkins += 1
  db.stats.estimatedGmv += config.defaultAvgTicket || 25000
  writeDb(db)

  return sendText(sock, jid, [
    '🎉 *Check-in berhasil!*',
    '',
    `Mission: ${claim.missionId}`,
    `Estimasi dampak transaksi: ${rupiah(config.defaultAvgTicket || 25000)}`,
    '',
    'Ini jadi bukti customer benar-benar datang.'
  ].join('\n'), quoted)
}

async function partner(sock, jid, quoted, db, user, phone) {
  const mission = latestMission(db, phone)
  if (!mission) return sendText(sock, jid, 'Belum ada campaign aktif. Ketik MULAI dulu.', quoted)

  const code = `GABUNG_${Math.random().toString(16).slice(2, 10).toUpperCase()}`
  db.partnerCodes.unshift({
    code,
    inviterPhone: phone,
    inviterName: mission.merchantName,
    missionId: mission.id,
    status: 'open',
    createdAt: now(),
    expiresAt: hoursFromNow(48)
  })
  writeDb(db)

  const botNumber = String(config.botNumber || '').replace(/[^0-9]/g, '') || 'nomorbot'
  const link = `https://wa.me/${botNumber}?text=${encodeURIComponent(`GABUNG ${code}`)}`
  return sendText(sock, jid, [
    '✅ *Link partner dibuat.*',
    '',
    'Kirim link ini ke UMKM partner:',
    link,
    '',
    `Kode manual: *GABUNG ${code}*`,
    '',
    'Kolaborasi live setelah dua pihak punya campaign dan sama-sama setuju/share.'
  ].join('\n'), quoted)
}

async function recap(sock, jid, quoted, db, phone) {
  const missions = db.missions.filter(mission => mission.merchantPhone === phone)
  if (!missions.length) return sendText(sock, jid, 'Belum ada campaign. Ketik MULAI untuk mulai.', quoted)

  return sendText(sock, jid, [
    '*Rekap Gatofo*',
    '',
    `Total campaign: ${missions.length}`,
    `Total claim: ${missions.reduce((sum, item) => sum + (item.claims || 0), 0)}`,
    `Total check-in: ${missions.reduce((sum, item) => sum + (item.checkins || 0), 0)}`,
    '',
    ...missions.slice(0, 5).map(item => `• ${item.id}\n  ${item.missionLabel} | ${item.promo}\n  Claim ${item.claims} / Check-in ${item.checkins}`)
  ].join('\n'), quoted)
}

async function ollamaStatus(sock, jid, quoted) {
  try {
    const status = await getOllamaStatus()
    return sendText(sock, jid, [
      '🧠 *Ollama Connected*',
      '',
      `Base URL: ${status.base}`,
      `Model: ${status.models.map(item => item.name || item.model).join(', ') || 'belum ada model'}`,
      '',
      'Pakai: *AI PROMO*'
    ].join('\n'), quoted)
  } catch (error) {
    return sendText(sock, jid, `❌ Ollama belum tersambung.\n\nError: ${error.message}`, quoted)
  }
}

async function aiPromo(sock, jid, quoted, db, user, phone) {
  const mission = latestMission(db, phone)
  const prompt = [
    'Buatkan copy campaign WhatsApp untuk Gatofo.',
    `Nama usaha: ${mission?.merchantName || user.name}`,
    `Kategori: ${mission?.category || user.category}`,
    `Kota: ${mission?.city || user.city}`,
    `Mood: ${MOODS[user.mood]?.label || user.mood || '-'}`,
    `Mission: ${mission?.missionLabel || '-'}`,
    `Promo: ${mission?.promo || user.pendingPromo || '-'}`,
    '',
    'Output: nama campaign, konsep 1 kalimat, caption WA maksimal 3 baris, ajakan claim, catatan check-in.'
  ].join('\n')

  try {
    const result = await generateWithOllama(prompt)
    return sendText(sock, jid, `🧠 *AI Promo dari Ollama*\nModel: ${result.model}\n\n${result.text}`, quoted)
  } catch (error) {
    return sendText(sock, jid, [
      '⚠️ Ollama belum bisa dipakai. Ini fallback cepat:',
      '',
      `Caption: Lagi cari promo ${mission?.category || user.category || 'UMKM'} di ${mission?.city || user.city || 'kotamu'}? Claim voucher Gatofo hari ini 🔥`,
      `Promo: ${mission?.promo || user.pendingPromo || 'Promo spesial Gatofo'}`,
      '',
      `Error Ollama: ${error.message}`
    ].join('\n'), quoted)
  }
}

async function aiAsk(sock, jid, quoted, text) {
  const question = clean(text.replace(/^AI TANYA/i, '').replace(/^TANYA AI/i, ''))
  if (!question) return sendText(sock, jid, 'Tulis pertanyaannya. Contoh: AI TANYA buat ide promo warung geprek sepi sore.', quoted)
  try {
    const result = await generateWithOllama(question)
    return sendText(sock, jid, `🧠 *AI Gatofo*\nModel: ${result.model}\n\n${result.text}`, quoted)
  } catch (error) {
    return sendText(sock, jid, `❌ Ollama gagal: ${error.message}`, quoted)
  }
}

export async function handleGatofoMessage({ sock, jid, quoted, db, phone, text }) {
  const user = getUser(db, phone, config)
  const q = upper(text)
  log(db, phone, 'in', text)

  if (!text || ['MULAI', 'MENU', 'START'].includes(q)) return startFlow(sock, jid, quoted, db, user)
  if (q === 'GATOFO_MOOD_MORE') return moreMood(sock, jid, quoted)

  if (q === 'BATAL' || q === 'GATOFO_CANCEL') {
    user.step = ''
    user.pendingCardId = ''
    user.pendingPromo = ''
    writeDb(db)
    return sendText(sock, jid, 'Alur dibatalkan. Ketik MULAI untuk mulai lagi.', quoted)
  }

  const moodKey = mapMood(text, user.step)
  if (moodKey) return selectMood(sock, jid, quoted, db, user, moodKey)

  if (q === 'GATOFO_SKIP_BUSINESS') return openBoxAndAskPromo(sock, jid, quoted, db, user, phone, '')
  if (q === 'GATOFO_EXAMPLE_BUSINESS') return sendText(sock, jid, 'Contoh balasan:\n*Geprek Kobong Malang*\n*The Harvest Malang jual kue ulang tahun*', quoted)
  if (user.step === 'business') return openBoxAndAskPromo(sock, jid, quoted, db, user, phone, text)

  if (user.step === 'confirm_category') {
    const category = mapCategoryChoice(text)
    if (!category) {
      return askCategoryConfirmation(sock, jid, quoted, db, user, {
        category: user.pendingCategory || 'Belum yakin',
        confidence: user.categoryConfidence || 0,
        source: user.categorySource || 'unknown',
        reason: 'Pilihan kategori belum terbaca. Coba tap lagi atau balas angka 1-7.'
      })
    }
    return confirmCategoryAndOpenBox(sock, jid, quoted, db, user, phone, category)
  }

  if (user.step === 'promo') {
    if (q === 'GATOFO_CUSTOM_PROMO' || q === 'KUSTOM PROMO' || q === 'CUSTOM PROMO' || q === 'PROMO CUSTOM') {
      return askCustomPromo(sock, jid, quoted, db, user)
    }

    // Fallback: kalau user langsung mengetik isi promo tanpa tap tombol.
    if (!q.startsWith('GATOFO_') && !['A', 'B', 'C'].includes(q)) {
      return saveCustomPromo(sock, jid, quoted, db, user, text)
    }

    return askCustomPromo(sock, jid, quoted, db, user)
  }

  if (user.step === 'custom_promo') {
    return saveCustomPromo(sock, jid, quoted, db, user, text)
  }

  if (q === 'PAKAI' || q === 'GATOFO_USE') return activateMission(sock, jid, quoted, db, user, phone)
  if (q === 'PARTNER' || q === 'GATOFO_PARTNER') return partner(sock, jid, quoted, db, user, phone)
  if (q === 'REKAP' || q === 'GATOFO_REKAP') return recap(sock, jid, quoted, db, phone)

  if (q.startsWith('CARI')) return searchMission(sock, jid, quoted, db, text)
  if (q.startsWith('GATOFO_CLAIM_')) return claimMission(sock, jid, quoted, db, phone, text.replace(/^GATOFO_CLAIM_/i, ''))
  if (q.startsWith('CLAIM ')) return claimMission(sock, jid, quoted, db, phone, text.split(/\s+/)[1])
  if (q.startsWith('CHECKIN ')) return checkin(sock, jid, quoted, db, phone, text)

  if (q === 'OLLAMA' || q === 'AI STATUS') return ollamaStatus(sock, jid, quoted)
  if (q === 'AI PROMO' || q === 'GATOFO_AI_PROMO') return aiPromo(sock, jid, quoted, db, user, phone)
  if (q.startsWith('AI TANYA') || q.startsWith('TANYA AI')) return aiAsk(sock, jid, quoted, text)

  return sendText(sock, jid, [
    'Perintah belum dikenali.',
    '',
    'Ketik *MULAI* untuk mulai.',
    'Atau:',
    '• CARI makanan Malang',
    '• CHECKIN KODE',
    '• REKAP',
    '• OLLAMA'
  ].join('\n'), quoted)
}
