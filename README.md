# Gatofo Core Cell — Neon PostgreSQL Edition

Versi ini sudah tidak menyimpan data Gatofo ke JSON lokal.

Data sekarang disimpan ke PostgreSQL Neon melalui env:

```text
DATABASE_URL
```

## Yang berubah

Sebelumnya:

```text
data/gatofo-db.json
```

Sekarang:

```text
PostgreSQL Neon
table: gatofo_state
column: data JSONB
```

File `data/gatofo-db.json` sudah dihapus.

## Env wajib

Isi di Render:

```text
DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=require
DATABASE_SSL=true
DB_TABLE_NAME=gatofo_state
DB_STATE_KEY=main
```

Env lain tetap:

```text
BOT_NUMBER=628xxxxxxxxxx
OWNER_NUMBERS=628xxxxxxxxxx
NODE_VERSION=20
USE_CUSTOM_PAIRING=false
```

## Struktur database

Bot otomatis membuat table ini saat start:

```sql
CREATE TABLE IF NOT EXISTS gatofo_state (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Data Gatofo disimpan sebagai 1 state JSONB:

```text
users
cards
missions
claims
partnerCodes
invites
logs
stats
```

Ini sengaja dibuat sederhana agar struktur kode lama tetap mudah dikembangkan. Kalau nanti traffic sudah besar, table bisa dinormalisasi menjadi `users`, `missions`, `claims`, dan lain-lain.

## Render

Gunakan:

```text
Service Type: Web Service
Build Command: npm install
Start Command: npm start
```

Kalau sebelumnya sudah deploy, lakukan:

```text
Manual Deploy → Clear build cache & deploy
```

Karena sekarang ada dependency baru:

```text
pg
```

## Cek koneksi database

Buka:

```text
/status
```

Nanti ada bagian:

```json
"db": {
  "mode": "postgres",
  "connected": true,
  "table": "gatofo_state",
  "key": "main"
}
```

Kalau `mode` masih `memory`, berarti `DATABASE_URL` belum diisi atau koneksi Neon gagal.

## Pairing WhatsApp

Buka URL Render:

```text
https://nama-service.onrender.com
```

Lalu:

```text
Reset Session
Buat Pairing Code Baru
Tautkan ke WhatsApp
```

## Flow Gatofo

```text
MULAI
→ pilih mood
→ ketik nama usaha + kota
→ validasi kategori jika perlu
→ Mystery Box
→ Kustom Promo
→ ketik promo
→ Pakai
→ campaign aktif
```
