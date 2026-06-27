import config from './settings.js'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { URL } from 'url'
import {
  makeWASocket,
  makeInMemoryStore,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers
} from '@dnuzi/baileys'
import pino from 'pino'
import chalk from 'chalk'
import { Boom } from '@hapi/boom'
import { initDb, readDb, writeDb, flushDb, closeDb, getDbStatus } from './src/db.js'
import { cleanPhone, getMessageText, jidToPhone } from './src/wa.js'
import { handleGatofoMessage } from './src/gatofoEngine.js'

const logger = pino({ level: process.env.LOG_LEVEL || 'silent' })
const storePath = process.env.STORE_PATH || './store.json'
const PORT = Number(process.env.PORT || 3000)

let sock = null
let isStarting = false
let reconnectTimer = null
let lastStoreInterval = null

const botState = {
  status: 'booting',
  connected: false,
  registered: false,
  jid: '',
  pairingCode: '',
  pairingCodeFormatted: '',
  lastPhone: '',
  lastError: '',
  updatedAt: new Date().toISOString()
}

function setState(patch) {
  Object.assign(botState, patch, { updatedAt: new Date().toISOString() })
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function esc(text = '') {
  return String(text).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]))
}

function normalizePairingPhone(value = '') {
  let n = cleanPhone(value)

  if (n.startsWith('0')) n = `62${n.slice(1)}`
  if (n.startsWith('8')) n = `62${n}`

  if (!/^62\d{8,15}$/.test(n)) {
    throw new Error('Nomor belum valid. Pakai format Indonesia: 628xxxxxxxxxx.')
  }

  return n
}

function formatPairingCode(code = '') {
  const clean = String(code || '').replace(/\s+/g, '').toUpperCase()
  return clean.match(/.{1,4}/g)?.join('-') || clean
}

function removePathSafe(target) {
  try {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true })
    }
  } catch (error) {
    console.log('Gagal hapus path:', target, error.message)
  }
}

function renderHome() {
  const isConnected = botState.connected
  const codeBlock = botState.pairingCode
    ? `<div class="code">${esc(botState.pairingCodeFormatted || botState.pairingCode)}</div>
       <p><b>Gunakan kode terbaru ini.</b> Masukkan di WhatsApp → Perangkat tertaut → Tautkan perangkat.</p>
       <p class="muted">Kalau muncul “gagal menautkan perangkat”, klik Reset Session dulu, lalu buat kode baru. Jangan pakai kode lama.</p>`
    : `<p class="muted">Belum ada pairing code. Masukkan nomor WhatsApp bot lalu klik Buat Pairing Code.</p>`

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(config.botName)} Pairing</title>
  <style>
    body{font-family:Inter,system-ui,Arial,sans-serif;background:#f7f4ff;margin:0;color:#21172f}
    .wrap{max-width:780px;margin:0 auto;padding:32px 18px}
    .card{background:white;border:1px solid #eadfff;border-radius:24px;padding:24px;box-shadow:0 18px 45px rgba(55,30,90,.10)}
    h1{margin:0 0 8px;font-size:28px}
    p{line-height:1.55}
    .muted{color:#6d607e}
    .status{display:inline-flex;gap:8px;align-items:center;border-radius:99px;padding:8px 12px;font-weight:800;background:${isConnected ? '#e9fff1' : '#fff3d8'};color:${isConnected ? '#087b3c' : '#8a5600'}}
    input{width:100%;box-sizing:border-box;padding:14px 16px;border-radius:14px;border:1px solid #d9c9ff;font-size:16px;margin:10px 0}
    button{border:0;border-radius:14px;padding:14px 16px;background:#6d4aff;color:white;font-weight:900;cursor:pointer;width:100%;font-size:16px}
    button:hover{filter:brightness(.96)}
    .danger{background:#ff4a6a}
    .secondary{background:#21172f}
    .code{font-size:36px;letter-spacing:6px;font-weight:1000;background:#21172f;color:white;border-radius:18px;padding:18px;text-align:center;margin:18px 0}
    pre{background:#21172f;color:#fff;border-radius:18px;padding:16px;overflow:auto}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}
    .mini{background:#faf7ff;border:1px solid #eadfff;border-radius:18px;padding:14px;word-break:break-word}
    .actions{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
    @media(max-width:640px){.grid,.actions{grid-template-columns:1fr}.code{font-size:26px}}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${esc(config.botName)}</h1>
      <p class="muted">Halaman pairing WhatsApp untuk deploy Render.</p>
      <div class="status">${isConnected ? '✅ Connected' : '⏳ ' + esc(botState.status)}</div>

      <div class="grid">
        <div class="mini"><b>Status</b><br>${esc(botState.status)}</div>
        <div class="mini"><b>JID</b><br>${esc(botState.jid || '-')}</div>
        <div class="mini"><b>Registered</b><br>${botState.registered ? 'true' : 'false'}</div>
        <div class="mini"><b>Updated</b><br>${esc(botState.updatedAt)}</div>
        <div class="mini"><b>Database</b><br>${esc(getDbStatus().mode)} ${getDbStatus().connected ? '✅' : '⚠️'}</div>
        <div class="mini"><b>DB Table</b><br>${esc(getDbStatus().table || '-')}</div>
      </div>

      <hr style="border:0;border-top:1px solid #eee;margin:22px 0">

      <form method="POST" action="/pair">
        <label><b>Nomor WhatsApp Bot</b></label>
        <input name="phone" placeholder="628xxxxxxxxxx" value="${esc(botState.lastPhone || config.phoneNumber || config.botNumber || '')}">
        <button type="submit">Buat Pairing Code Baru</button>
      </form>

      <div class="actions">
        <form method="POST" action="/restart"><button class="secondary" type="submit">Restart Socket</button></form>
        <form method="POST" action="/reset-session" onsubmit="return confirm('Reset session akan menghapus login WhatsApp dan wajib pairing ulang. Lanjut?')"><button class="danger" type="submit">Reset Session</button></form>
      </div>

      ${codeBlock}

      ${botState.lastError ? `<pre>${esc(botState.lastError)}</pre>` : ''}

      <p class="muted">Endpoint: <code>/status</code>, <code>/pair?phone=628xxx</code>, <code>/restart</code>, <code>/reset-session</code></p>
    </div>
  </div>
</body>
</html>`
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store'
  })
  res.end(type.includes('json') ? JSON.stringify(body, null, 2) : body)
}

async function requestPairing(phone) {
  const clean = normalizePairingPhone(phone || config.phoneNumber || config.botNumber)
  setState({ lastPhone: clean, pairingCode: '', pairingCodeFormatted: '', lastError: '', status: 'preparing_pairing' })

  if (!sock) await connectToWhatsApp()
  if (!sock) throw new Error('Socket WhatsApp belum siap. Klik Restart Socket lalu coba lagi.')

  if (sock.authState?.creds?.registered || botState.connected) {
    throw new Error('Session sudah registered/connected. Kalau WhatsApp belum benar-benar tertaut, klik Reset Session dulu lalu buat pairing code baru.')
  }

  // Beri waktu WebSocket Baileys benar-benar siap sebelum request pairing.
  await wait(Number(process.env.PAIRING_READY_DELAY_MS || 1800))

  // Custom pairing code sering bikin "gagal menautkan perangkat" di beberapa nomor.
  // Default dibuat memakai kode resmi/generate otomatis dari WhatsApp.
  let code
  if (config.useCustomPairing && config.customPairing) {
    code = await sock.requestPairingCode(clean, config.customPairing)
  } else {
    code = await sock.requestPairingCode(clean)
  }

  const formatted = formatPairingCode(code)
  setState({
    pairingCode: code,
    pairingCodeFormatted: formatted,
    lastPhone: clean,
    lastError: '',
    status: 'pairing_code_ready'
  })

  console.log(chalk.yellow(`\nPairing Code untuk ${clean}: ${formatted}\n`))
  return code
}

function startHttpServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`)

      if (req.method === 'GET' && url.pathname === '/') {
        return send(res, 200, renderHome(), 'text/html; charset=utf-8')
      }

      if (req.method === 'GET' && url.pathname === '/status') {
        return send(res, 200, { ok: true, ...botState, db: getDbStatus() })
      }

      if (req.method === 'GET' && url.pathname === '/pair') {
        const phone = url.searchParams.get('phone') || config.phoneNumber || config.botNumber
        const code = await requestPairing(phone)
        return send(res, 200, { ok: true, pairingCode: code, pairingCodeFormatted: formatPairingCode(code), phone: normalizePairingPhone(phone) })
      }

      if (req.method === 'POST' && url.pathname === '/pair') {
        let raw = ''
        req.on('data', chunk => { raw += chunk })
        req.on('end', async () => {
          try {
            const params = new URLSearchParams(raw)
            const phone = params.get('phone') || config.phoneNumber || config.botNumber
            await requestPairing(phone)
          } catch (error) {
            setState({ lastError: error.message, status: 'pairing_failed' })
          }
          res.writeHead(303, { location: '/' })
          res.end()
        })
        return
      }

      if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/restart') {
        await restartBot()
        if (req.method === 'POST') {
          res.writeHead(303, { location: '/' })
          res.end()
          return
        }
        return send(res, 200, { ok: true, message: 'restart requested', ...botState })
      }

      if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/reset-session') {
        await resetSession()
        if (req.method === 'POST') {
          res.writeHead(303, { location: '/' })
          res.end()
          return
        }
        return send(res, 200, { ok: true, message: 'session reset', ...botState })
      }

      return send(res, 404, { ok: false, error: 'Not found' })
    } catch (error) {
      setState({ lastError: error.message })
      return send(res, 500, { ok: false, error: error.message })
    }
  })

  server.listen(PORT, () => {
    console.log(chalk.green(`Pairing web aktif di port ${PORT}`))
  })
}

async function connectToWhatsApp() {
  if (isStarting) return sock
  isStarting = true
  setState({ status: 'starting', lastError: '' })

  try {
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionName)
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
      version,
      logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      printQRInTerminal: false,
      markOnlineOnConnect: true,
      syncFullHistory: false,
      browser: Browsers.ubuntu('Chrome')
    })

    const store = makeInMemoryStore({ logger })
    try { store.readFromFile(storePath) } catch {}
    store.bind(sock.ev)

    if (lastStoreInterval) clearInterval(lastStoreInterval)
    lastStoreInterval = setInterval(() => {
      try { store.writeToFile(storePath) } catch {}
    }, 180000)

    setState({
      status: sock.authState?.creds?.registered ? 'registered_waiting_connection' : 'waiting_pairing',
      registered: Boolean(sock.authState?.creds?.registered)
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages?.[0]
      if (!msg?.message) return
      if (msg.key?.fromMe) return

      const jid = msg.key.remoteJid
      if (!jid || jid === 'status@broadcast') return

      const isGroup = jid.endsWith('@g.us')
      if (isGroup && !config.allowGroups) return

      const text = getMessageText(msg.message)
      if (!text) return

      const phone = cleanPhone(isGroup ? jidToPhone(msg.key.participant) : jidToPhone(jid))
      const db = readDb()

      try {
        await sock.sendPresenceUpdate('composing', jid).catch(() => {})
        await handleGatofoMessage({ sock, jid, quoted: msg, db, phone, text })
        writeDb(db)
      } catch (error) {
        console.error('Gagal proses pesan:', error)
        await sock.sendMessage(jid, { text: `Maaf, ada error:\n${error.message}` }, { quoted: msg })
      }
    })

    sock.ev.on('connection.update', async update => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        setState({ status: 'qr_ready_waiting_pairing' })
      }

      if (connection === 'connecting') {
        setState({ status: 'connecting', connected: false })
      }

      if (connection === 'open') {
        setState({
          status: 'connected',
          connected: true,
          registered: true,
          jid: sock.user?.id || '',
          pairingCode: '',
          pairingCodeFormatted: '',
          lastError: ''
        })
        console.log(chalk.green(`${config.botName} connected`))
      }

      if (connection === 'close') {
        const reason = new Boom(lastDisconnect?.error)?.output.statusCode
        const loggedOut = reason === DisconnectReason.loggedOut

        setState({
          status: loggedOut ? 'logged_out' : 'disconnected',
          connected: false,
          registered: Boolean(sock?.authState?.creds?.registered),
          jid: '',
          lastError: lastDisconnect?.error?.message || `Connection closed (${reason || 'unknown'})`
        })

        if (!loggedOut) {
          clearTimeout(reconnectTimer)
          reconnectTimer = setTimeout(() => connectToWhatsApp(), Number(process.env.RECONNECT_MS || 5000))
        } else {
          console.log(chalk.red('Session logout. Klik Reset Session lalu buat pairing code baru.'))
        }
      }
    })

    return sock
  } catch (error) {
    setState({ status: 'error', connected: false, lastError: error.message })
    console.error('Gagal start WhatsApp:', error)
    return null
  } finally {
    isStarting = false
  }
}

async function stopSocket() {
  clearTimeout(reconnectTimer)
  reconnectTimer = null

  if (sock) {
    try { sock.end?.() } catch {}
    try { sock.ws?.close?.() } catch {}
  }

  sock = null
  isStarting = false
}

async function restartBot() {
  await stopSocket()
  setState({ status: 'restarting', connected: false, jid: '', pairingCode: '', pairingCodeFormatted: '' })
  return connectToWhatsApp()
}

async function resetSession() {
  await stopSocket()
  removePathSafe(config.sessionName)
  removePathSafe(storePath)
  setState({
    status: 'session_reset_waiting_pairing',
    connected: false,
    registered: false,
    jid: '',
    pairingCode: '',
    pairingCodeFormatted: '',
    lastError: ''
  })
  await wait(500)
  return connectToWhatsApp()
}

process.on('SIGTERM', async () => {
  console.log('SIGTERM diterima. Menyimpan data lalu berhenti.')
  await closeDb().catch(() => {})
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT diterima. Menyimpan data lalu berhenti.')
  await closeDb().catch(() => {})
  process.exit(0)
})

startHttpServer()
await initDb()
connectToWhatsApp()
