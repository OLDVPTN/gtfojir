# Gatofo Flow — Neon PostgreSQL Edition

## Flow utama

```text
MULAI
↓
Mood
↓
Nama usaha + kota
↓
Validasi kategori kalau sistem tidak yakin
↓
Mystery Box
↓
Contoh promo
↓
Kustom Promo
↓
Owner ketik promo sendiri
↓
Pakai
↓
Campaign aktif
```

## Penyimpanan data

Tidak memakai JSON lokal lagi.

Sekarang data disimpan di Neon PostgreSQL:

```text
DATABASE_URL
```

Table otomatis:

```text
gatofo_state
```

State yang disimpan:

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

## Cek status

```text
/status
```

Pastikan:

```text
db.mode = postgres
db.connected = true
```

Kalau masih `memory`, env `DATABASE_URL` belum benar.
