# Gatofo Core Cell — Pairing Fix Edition

Versi ini memperbaiki masalah:

```text
Pairing code muncul, tapi saat ditautkan di WhatsApp muncul:
"Gagal menautkan perangkat"
```

Perubahan utama:

```text
1. Pairing code default sekarang pakai kode otomatis dari WhatsApp/Baileys.
2. Custom pairing code dimatikan default karena bisa gagal di beberapa nomor.
3. Ditambahkan tombol Reset Session di halaman web.
4. Ditambahkan delay sebelum request pairing agar socket lebih siap.
5. Browser identity diganti ke Browsers.ubuntu('Chrome').
6. Auth key store memakai makeCacheableSignalKeyStore.
```

## Cara pairing yang disarankan

1. Deploy ke Render.
2. Buka URL Render.
3. Klik **Reset Session** dulu.
4. Masukkan nomor bot format:

```text
628xxxxxxxxxx
```

5. Klik **Buat Pairing Code Baru**.
6. Masukkan kode terbaru di:

```text
WhatsApp → Perangkat tertaut → Tautkan perangkat
```

Jangan pakai kode lama. Pairing code cepat kedaluwarsa.

## Env Render

Minimal:

```text
BOT_NUMBER=628xxxxxxxxxx
OWNER_NUMBERS=628xxxxxxxxxx
NODE_VERSION=20
USE_CUSTOM_PAIRING=false
```

`CUSTOM_PAIRING` boleh tetap ada, tapi tidak dipakai kecuali:

```text
USE_CUSTOM_PAIRING=true
```

Untuk stabilitas, biarkan:

```text
USE_CUSTOM_PAIRING=false
```

## Endpoint

```text
/
 /status
 /pair?phone=628xxxxxxxxxx
 /restart
 /reset-session
```

## Jika masih gagal menautkan

Coba urutan ini:

```text
1. Klik Reset Session
2. Tunggu status berubah jadi waiting_pairing
3. Buat Pairing Code Baru
4. Langsung masukkan kode itu ke WhatsApp
```

Kalau tetap gagal, kemungkinan nomor terlalu sering pairing / WhatsApp membatasi percobaan. Tunggu beberapa menit lalu ulangi.

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
