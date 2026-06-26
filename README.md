# Gatofo Core Cell — Web Pairing Render Edition

Versi ini dibuat agar lebih enak dideploy ke Render.

Masalah sebelumnya:

```text
Build/start gagal karena bot worker tidak punya halaman pairing
atau package Baileys tidak kebaca di environment Render.
```

Versi ini sudah:

```text
- Menggunakan @whiskeysockets/baileys
- Node dipin ke 20.x
- Render diubah dari worker menjadi web service
- Ada halaman pairing code di browser
- Tidak perlu input terminal interaktif
```

## Cara kerja pairing web

Setelah deploy ke Render, buka URL service:

```text
https://nama-service.onrender.com
```

Lalu isi nomor bot:

```text
628xxxxxxxxxx
```

Klik:

```text
Buat Pairing Code
```

Masukkan kode di:

```text
WhatsApp → Perangkat tertaut → Tautkan perangkat
```

## Endpoint

```text
GET /
GET /status
GET /pair?phone=628xxxxxxxxxx
GET /restart
```

## Env Render

Minimal isi:

```text
BOT_NUMBER=628xxxxxxxxxx
OWNER_NUMBERS=628xxxxxxxxxx
CUSTOM_PAIRING=GATOFO25
NODE_VERSION=20
```

`PHONE_NUMBER` tidak wajib lagi karena pairing bisa dibuat lewat web.

## Render setting

Gunakan:

```text
Service Type: Web Service
Build Command: npm install
Start Command: npm start
```

Atau pakai `render.yaml` yang sudah tersedia.

Kalau sebelumnya deploy gagal, lakukan:

```text
Manual Deploy → Clear build cache & deploy
```

## Catatan penting

Render filesystem bisa ephemeral. Kalau session WhatsApp hilang setelah redeploy/restart, kamu perlu pairing ulang dari halaman web.

Untuk pilot/testing masih aman. Untuk production serius, lebih baik pakai WhatsApp Business Platform resmi atau simpan session di storage persisten.

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

## Command

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
