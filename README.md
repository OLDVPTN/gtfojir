# Gatofo Core Cell — Custom Promo + Render Edition

Versi ini sudah disederhanakan lagi:

```text
MULAI
→ pilih mood
→ ketik nama usaha + kota
→ validasi kategori jika perlu
→ Mystery Box terbuka
→ tap Kustom Promo
→ ketik promo sendiri
→ tap Pakai
```

## Update 5.2 — Promo wajib kustom

Di bagian Mystery Box, teks:

```text
Pilih promo cepat
```

sudah diganti menjadi:

```text
Contoh:
```

Bot tidak lagi memberi pilihan A/B/C sebagai promo siap pakai.

Sekarang bot hanya menampilkan contoh promo, lalu tombol:

```text
Kustom Promo
```

Setelah tap tombol itu, owner menulis promonya sendiri.

Contoh flow:

```text
MULAI
Sepi
The Harvest Malang
Dessert / Roti
Kustom Promo
Diskon 10% cake ukuran 20 cm khusus hari ini
Pakai
```

Tujuannya agar promo tidak terasa template dan owner benar-benar memakai promo yang sesuai kondisi usahanya.

## Struktur

```text
index.js
settings.js
render.yaml
.env.example
src/
  db.js
  wa.js
  ollama.js
  gatofoEngine.js
data/
  gatofo-db.json
```

## Deploy ke Render

Project sudah ditambahkan `render.yaml` untuk deploy sebagai **Background Worker**.

Render Blueprint mendukung definisi service via `render.yaml`, termasuk background worker. Untuk env var, Render juga memang menyarankan konfigurasi lewat environment variables/secrets.

### Env var wajib di Render

Isi di Render Dashboard:

```text
PHONE_NUMBER=628xxxxxxxxxx
BOT_NUMBER=628xxxxxxxxxx
OWNER_NUMBERS=628xxxxxxxxxx
CUSTOM_PAIRING=GATOFO25
```

Opsional:

```text
OLLAMA_BASE_URL=https://desktop-bh6k0ih.taildd515d.ts.net/api/tags
OLLAMA_MODEL=
USE_OLLAMA_FOR_CATEGORY=true
CATEGORY_CONFIDENCE_THRESHOLD=0.72
DEFAULT_CITY=Malang
ALLOW_GROUPS=false
```

### Penting untuk pairing

Di local, bot bisa meminta nomor lewat terminal.

Di Render, tidak ada input terminal interaktif. Jadi `PHONE_NUMBER` wajib diisi sebagai environment variable.

Saat pertama deploy, buka logs Render dan ambil:

```text
Pairing Code: XXXXXXXX
```

Masukkan kode itu di WhatsApp:

```text
WhatsApp → Perangkat tertaut → Tautkan perangkat
```

### Catatan session

Session WhatsApp disimpan di folder `SESSION_DIR`.

Kalau service restart dan session hilang, kamu perlu pairing ulang. Untuk pilot/testing masih aman, tapi untuk produksi sebaiknya pakai penyimpanan persisten atau layanan resmi WhatsApp Business Platform.

## Install lokal

```bash
npm install
npm start
```

## Command utama

```text
MULAI
CARI makanan Malang
CLAIM MISSION_ID
CHECKIN KODE
REKAP
PARTNER
OLLAMA
AI PROMO
AI TANYA ...
```
