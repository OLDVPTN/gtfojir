const config = {
  botName: process.env.BOT_NAME || 'Gatofo Core Cell',
  owner: (process.env.OWNER_NUMBERS || '6281239075413').split(',').map(item => item.trim()).filter(Boolean),
  ownerName: process.env.OWNER_NAME || 'Poko Group',
  version: '5.3.1-pairing-fix',
  footer: process.env.BOT_FOOTER || 'Gatofo Core Cell — Poko Group',
  sessionName: process.env.SESSION_DIR || 'session',
  customPairing: process.env.CUSTOM_PAIRING || 'GATOFO25',
  useCustomPairing: String(process.env.USE_CUSTOM_PAIRING || 'false').toLowerCase() === 'true',
  botNumber: process.env.BOT_NUMBER || '628000000000',
  phoneNumber: process.env.PHONE_NUMBER || '',

  // Ollama
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'https://desktop-bh6k0ih.taildd515d.ts.net/api/tags',
  ollamaModel: process.env.OLLAMA_MODEL || '',
  ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || 25000),

  // Category detection
  useOllamaForCategory: String(process.env.USE_OLLAMA_FOR_CATEGORY || 'true').toLowerCase() !== 'false',
  categoryConfidenceThreshold: Number(process.env.CATEGORY_CONFIDENCE_THRESHOLD || 0.72),

  // Default pilot
  defaultCity: process.env.DEFAULT_CITY || 'Malang',
  defaultAvgTicket: Number(process.env.DEFAULT_AVG_TICKET || 25000),

  // Group messages off by default
  allowGroups: String(process.env.ALLOW_GROUPS || 'false').toLowerCase() === 'true'
}

export default config
