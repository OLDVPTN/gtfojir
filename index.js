import config from './settings.js'
import {
  makeWASocket,
  makeInMemoryStore,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@dnuzi/baileys'
import pino from 'pino'
import readline from 'readline'
import chalk from 'chalk'
import { Boom } from '@hapi/boom'
import { readDb, writeDb } from './src/db.js'
import { cleanPhone, getMessageText, jidToPhone } from './src/wa.js'
import { handleGatofoMessage } from './src/gatofoEngine.js'

const logger = pino({ level: 'silent' })
const storePath = process.env.STORE_PATH || './store.json'

function question(text) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(text, answer => {
    rl.close()
    resolve(answer)
  }))
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionName)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    markOnlineOnConnect: true,
    syncFullHistory: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04']
  })

  const store = makeInMemoryStore({ logger })
  try { store.readFromFile(storePath) } catch {}
  store.bind(sock.ev)
  setInterval(() => {
    try { store.writeToFile(storePath) } catch {}
  }, 180000)

  if (!sock.authState.creds.registered) {
    const phoneNumber = cleanPhone(
      config.phoneNumber ||
      (process.stdin.isTTY ? await question(chalk.green('Masukkan nomor WhatsApp awali 62: ')) : '')
    )

    if (!phoneNumber || phoneNumber === 'demo') {
      throw new Error('PHONE_NUMBER belum diisi. Untuk deploy Render, set env var PHONE_NUMBER=628xxxxxxxxxx.')
    }

    const code = await sock.requestPairingCode(phoneNumber, config.customPairing)
    console.log(chalk.yellow(`\nPairing Code: ${code}\n`))
    console.log(chalk.green('Masukkan pairing code itu di WhatsApp > Perangkat tertaut > Tautkan perangkat.'))
  }

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
      await handleGatofoMessage({
        sock,
        jid,
        quoted: msg,
        db,
        phone,
        text
      })
      writeDb(db)
    } catch (error) {
      console.error('Gagal proses pesan:', error)
      await sock.sendMessage(jid, { text: `Maaf, ada error:\n${error.message}` }, { quoted: msg })
    }
  })

  sock.ev.on('connection.update', async update => {
    const { connection, lastDisconnect } = update

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output.statusCode
      if (reason !== DisconnectReason.loggedOut) {
        console.log(chalk.red('Reconnect...'))
        process.on('SIGTERM', () => {
  console.log('SIGTERM diterima. Bot berhenti dengan aman.')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT diterima. Bot berhenti dengan aman.')
  process.exit(0)
})

connectToWhatsApp().catch(error => {
  console.error('Gagal start bot:', error.message)
  process.exit(1)
})
      } else {
        console.log(chalk.red('Session logout. Hapus folder session lalu pairing ulang.'))
      }
    }

    if (connection === 'open') {
      console.log(chalk.green(`${config.botName} connected`))
    }
  })
}

process.on('SIGTERM', () => {
  console.log('SIGTERM diterima. Bot berhenti dengan aman.')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT diterima. Bot berhenti dengan aman.')
  process.exit(0)
})

connectToWhatsApp().catch(error => {
  console.error('Gagal start bot:', error.message)
  process.exit(1)
})
