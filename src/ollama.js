import config from '../settings.js'

function normalizeBaseUrl(url = '') {
  return String(url || config.ollamaBaseUrl || '')
    .trim()
    .replace(/\/api\/tags$/i, '')
    .replace(/\/api\/generate$/i, '')
    .replace(/\/+$/g, '')
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.ollamaTimeoutMs || 25000)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    const text = await res.text()
    let data = {}
    try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
    if (!res.ok) throw new Error(data.error || data.message || data.raw || `${res.status} ${res.statusText}`)
    return data
  } finally {
    clearTimeout(timeout)
  }
}

export async function getOllamaStatus() {
  const base = normalizeBaseUrl()
  const data = await fetchWithTimeout(`${base}/api/tags`)
  return { base, models: data.models || [] }
}

export async function generateWithOllama(prompt) {
  const { base, models } = await getOllamaStatus()
  const model = config.ollamaModel || models[0]?.name || models[0]?.model
  if (!model) throw new Error('Belum ada model Ollama. Pull model dulu, contoh: ollama pull llama3.2')

  const data = await fetchWithTimeout(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      system: [
        'Kamu adalah AI copywriter Gatofo Core Cell untuk UMKM Indonesia.',
        'Jawab singkat, praktis, dan siap dipakai di WhatsApp.',
        'Jangan overclaim. PR berarti Potential Reach, bukan jaminan pelanggan datang.',
        'Selalu arahkan ke claim voucher dan check-in.'
      ].join(' '),
      prompt,
      options: { temperature: 0.7, num_predict: 350 }
    })
  })

  return {
    model,
    text: String(data.response || data.message?.content || '').trim()
  }
}


export async function classifyBusinessWithOllama(inputText = '') {
  const prompt = [
    'Klasifikasikan UMKM dari input user.',
    '',
    `Input: ${inputText}`,
    '',
    'Kategori valid hanya salah satu:',
    'makanan, minuman, dessert, cafe, fashion, jasa, lainnya, unknown',
    '',
    'Aturan:',
    '- Kalau input hanya nama brand dan tidak ada petunjuk produk, jangan terlalu percaya diri.',
    '- Kalau tidak yakin, gunakan category "unknown" dan confidence di bawah 0.6.',
    '- Kalau ada kata kue/cake/dessert/roti, gunakan dessert.',
    '- Kalau ada kopi/minuman/boba/jus, gunakan minuman.',
    '- Kalau ada geprek/mie/bakso/nasi/kuliner, gunakan makanan.',
    '',
    'Balas JSON saja tanpa markdown:',
    '{"businessName":"...","city":"...","category":"unknown","confidence":0.3,"reason":"..."}'
  ].join('\n')

  const result = await generateWithOllama(prompt)
  const raw = String(result.text || '').trim()
  const jsonText = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim()
  try {
    const parsed = JSON.parse(jsonText)
    return {
      businessName: parsed.businessName || '',
      city: parsed.city || '',
      category: parsed.category || 'unknown',
      confidence: Number(parsed.confidence || 0),
      reason: parsed.reason || '',
      raw
    }
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      return {
        businessName: parsed.businessName || '',
        city: parsed.city || '',
        category: parsed.category || 'unknown',
        confidence: Number(parsed.confidence || 0),
        reason: parsed.reason || '',
        raw
      }
    }
    return {
      businessName: '',
      city: '',
      category: 'unknown',
      confidence: 0,
      reason: 'Ollama tidak mengembalikan JSON valid',
      raw
    }
  }
}
