export function cleanPhone(value = '') {
  return String(value || '').replace(/[^0-9]/g, '') || 'demo'
}

export function jidToPhone(jid = '') {
  return cleanPhone(String(jid).split('@')[0])
}

function parseNativeFlowId(msg = {}) {
  const candidates = [
    msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson,
    msg.interactiveResponseMessage?.nativeFlowResponseMessage?.params,
    msg.interactiveResponseMessage?.nativeFlowResponseMessage?.responseJson
  ]

  for (const raw of candidates) {
    if (!raw) continue
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      const id =
        parsed.id ||
        parsed.button_id ||
        parsed.selectedRowId ||
        parsed.selectedId ||
        parsed.rowId ||
        parsed.name
      if (id) return String(id).trim()
    } catch {}
  }

  return ''
}

export function getMessageText(message = {}) {
  const msg =
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message

  // Native flow/list button kadang punya body text generik seperti "Pilih Kategori".
  // Jadi ID dari paramsJson harus dibaca lebih dulu agar flow tidak mengulang pertanyaan.
  const nativeId = parseNativeFlowId(msg)
  if (nativeId) return nativeId

  const direct =
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.buttonsResponseMessage?.selectedDisplayText ||
    msg.templateButtonReplyMessage?.selectedId ||
    msg.templateButtonReplyMessage?.selectedDisplayText ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.listResponseMessage?.title ||
    msg.interactiveResponseMessage?.body?.text ||
    ''

  return String(direct || '').trim()
}

export async function sendText(sock, jid, text, quoted = null) {
  return await sock.sendMessage(jid, { text }, quoted ? { quoted } : {})
}

export async function sendButtons(sock, jid, text, buttons = [], quoted = null, footer = 'Gatofo Core Cell') {
  const options = quoted ? { quoted } : {}

  // Format custom/fork yang dipakai base simple-baseV2.
  const forkPayload = {
    text,
    footer,
    buttons: buttons.map(button => ({
      text: button.text,
      id: button.id
    }))
  }

  // Format legacy Baileys v6 / @whiskeysockets/baileys.
  const legacyPayload = {
    text,
    footer,
    buttons: buttons.map(button => ({
      buttonId: button.id,
      buttonText: { displayText: button.text },
      type: 1
    })),
    headerType: 1
  }

  try {
    return await sock.sendMessage(jid, forkPayload, options)
  } catch {
    try {
      return await sock.sendMessage(jid, legacyPayload, options)
    } catch {
      const fallback = [
        text,
        '',
        'Pilihan:',
        ...buttons.map((button, index) => `${index + 1}. ${button.text}`)
      ].join('\n')
      return await sendText(sock, jid, fallback, quoted)
    }
  }
}

export async function sendList(sock, jid, text, buttonText, rows = [], quoted = null, footer = 'Gatofo Core Cell') {
  const options = quoted ? { quoted } : {}

  // Format custom/fork base.
  const forkPayload = {
    text,
    footer,
    buttons: [
      {
        text: buttonText,
        sections: [
          {
            title: buttonText,
            rows
          }
        ]
      }
    ]
  }

  // Format legacy list Baileys v6.
  const legacyPayload = {
    text,
    footer,
    title: buttonText,
    buttonText,
    sections: [
      {
        title: buttonText,
        rows: rows.map(row => ({
          title: row.title,
          description: row.description,
          rowId: row.id
        }))
      }
    ]
  }

  try {
    return await sock.sendMessage(jid, forkPayload, options)
  } catch {
    try {
      return await sock.sendMessage(jid, legacyPayload, options)
    } catch {
      const fallback = [
        text,
        '',
        ...rows.map((row, index) => `${index + 1}. ${row.title}${row.description ? ` — ${row.description}` : ''}`)
      ].join('\n')
      return await sendText(sock, jid, fallback, quoted)
    }
  }
}
