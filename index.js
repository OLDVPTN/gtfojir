import config from './settings.js'
import http from 'http'
import { URL } from 'url'
import {
  makeWASocket,
  makeInMemoryStore,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@dnuzi/baileys'
import pino from 'pino'
import chalk from 'chalk'
import { Boom } from '@hapi/boom'
import { readDb, writeDb } from './src/db.js'
import { cleanPhone, getMessageText, jidToPhone } from './src/wa.js'
import { handleGatofoMessage } from './src/gatofoEngine.js'

const logger = pino({ level: process.env.LOG_LEVEL || 'silent' })
const storePath = process.env.STORE_PATH || './store.json'
const PORT = Number(process.env.PORT || 3000)

let sock = null
let isStarting = false
let reconnectTimer = null

const botState = {
  status: 'booting',
  connected: false,
  registered: false,
  jid: '',
  pairingCode: '',
  lastPhone: '',
  lastError: '',
  updatedAt: new Date().toISOString()
}

function setState(patch) {
  Object.assign(botState, patch, { updatedAt: new Date().toISOString() })
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

function renderHome() {
  const isConnected = botState.connected
  const codeBlock = botState.pairingCode
    ? `<div class="code">${esc(botState.pairingCode)}</div><p>Masukkan kode ini di WhatsApp → Perangkat tertaut → Tautkan perangkat.</p>`
    : `<p class="muted">Belum ada pairing code. Masukkan nomor WhatsApp bot lalu klik Buat Pairing Code.</p>`

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(config.botName)} Pairing</title>
  <style>
    body{font-family:Inter,system-ui,Arial,sans-serif;background:#f7f4ff;margin:0;color:#21172f}
    .wrap{max-width:760px;margin:0 auto;padding:32px 18px}
    .card{background:white;border:1px solid #eadfff;border-radius:24px;padding:24px;box-shadow:0 18px 45px rgba(55,30,90,.10)}
    h1{margin:0 0 8px;font-size:28px}
    p{line-height:1.55}
    .muted{color:#6d607e}
    .status{display:inline-flex;gap:8px;align-items:center;border-radius:99px;padding:8px 12px;font-weight:800;background:${isConnected ? '#e9fff1' : '#fff3d8'};color:${isConnected ? '#087b3c' : '#8a5600'}}
    input{width:100%;box-sizing:border-box;padding:14px 16px;border-radius:14px;border:1px solid #d9c9ff;font-size:16px;margin:10px 0}
    button{border:0;border-radius:14px;padding:14px 16px;background:#6d4aff;color:white;font-weight:900;cursor:pointer;width:100%;font-size:16px}
    button:hover{filter:brightness(.96)}
    .code{font-size:34px;letter-spacing:6px;font-weight:1000;background:#21172f;color:white;border-radius:18px;padding:18px;text-align:center;margin:18px 0}
    pre{background:#21172f;color:#fff;border-radius:18px;padding:16px;overflow:auto}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}
    .mini{background:#faf7ff;border:1px solid #eadfff;border-radius:18px;padding:14px}
    @media(max-width:640px){.grid{grid-template-columns:1fr}.code{font-size:26px}}
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
      </div>

      <hr style="border:0;border-top:1px solid #eee;margin:22px 0">

      <form method="POST" action="/pair">
        <label><b>Nomor WhatsApp Bot</b></label>
        <input name="phone" placeholder="628xxxxxxxxxx" value="${esc(botState.lastPhone || config.phoneNumber || config.botNumber || '')}">
        <button type="submit">Buat Pairing Code</button>
      </form>

      ${codeBlock}

      ${botState.lastError ? `<pre>${esc(botState.lastError)}</pre>` : ''}

      <p class="muted">Endpoint: <code>/status</code>, <code>/pair?phone=628xxx</code>, <code>/restart</code></p>
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
  const clean = cleanPhone(phone || config.phoneNumber || config.botNumber)
  if (!clean || clean === 'demo') throw new Error('Nomor belum valid. Pakai format 628xxxxxxxxxx.')
  if (!sock) await connectToWhatsApp()
  if (!sock) throw new Error('Socket WhatsApp belum siap. Tunggu beberapa detik lalu coba lagi.')

  const code = await sock.requestPairingCode(clean, config.customPairing)
  setState({ pairingCode: code, lastPhone: clean, lastError: '', status: 'pairing_code_ready' })
  console.log(chalk.yellow(`\nPairing Code untuk ${clean}: ${code}\n`))
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
        return send(res, 200, { ok: true, ...botState })
      }

      if (req.method === 'GET' && url.pathname === '/pair') {
        const phone = url.searchParams.get('phone') || config.phoneNumber || config.botNumber
        const code = await requestPairing(phone)
        return send(res, 200, { ok: true, pairingCode: code, phone: cleanPhone(phone) })
      }

      if (req.method === 'POST' && url.pathname === '/pair') {
        let raw = ''
        req.on('data', chunk => { raw += chunk })
        req.on('end', async () => {
          try {
            const params = new URLSearchParams(raw)
            const phone = params.get('phone') || config.phoneNumber || config.botNumber
            await requestPairing(phone)
            res.writeHead(303, { location: '/' })
            res.end()
          } catch (error) {
            setState({ lastError: error.message })
            res.writeHead(303, { location: '/' })
            res.end()
          }
        })
        return
      }

      if (req.method === 'GET' && url.pathname === '/restart') {
        await restartBot()
        return send(res, 200, { ok: true, message: 'restart requested', ...botState })
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
      auth: state,
      printQRInTerminal: false,
      markOnlineOnConnect: true,
      syncFullHistory: false,
      browser: ['Gatofo Core Cell', 'Chrome', '1.0.0']
    })

    const store = makeInMemoryStore({ logger })
    try { store.readFromFile(storePath) } catch {}
    store.bind(sock.ev)
    setInterval(() => {
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
      const { connection, lastDisconnect } = update

      if (connection === 'open') {
        setState({
          status: 'connected',
          connected: true,
          registered: true,
          jid: sock.user?.id || '',
          pairingCode: '',
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
          jid: '',
          lastError: lastDisconnect?.error?.message || `Connection closed (${reason || 'unknown'})`
        })

        if (!loggedOut) {
          clearTimeout(reconnectTimer)
          reconnectTimer = setTimeout(() => connectToWhatsApp(), Number(process.env.RECONNECT_MS || 5000))
        } else {
          console.log(chalk.red('Session logout. Buka halaman web lalu buat pairing code lagi.'))
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

async function restartBot() {
  clearTimeout(reconnectTimer)
  reconnectTimer = null

  if (sock) {
    try { sock.end?.() } catch {}
    try { sock.ws?.close?.() } catch {}
  }

  sock = null
  isStarting = false
  setState({ status: 'restarting', connected: false, jid: '', pairingCode: '' })
  return connectToWhatsApp()
}

process.on('SIGTERM', () => {
  console.log('SIGTERM diterima. Bot berhenti dengan aman.')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT diterima. Bot berhenti dengan aman.')
  process.exit(0)
})

startHttpServer()
connectToWhatsApp()
