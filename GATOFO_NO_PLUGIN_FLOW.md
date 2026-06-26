# Gatofo Flow — Custom Promo Edition

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

## Mystery Box

Bot sekarang menampilkan:

```text
Contoh:
• Diskon 10% roti/dessert pilihan
• Paket hemat dessert khusus Gatofo
• Bonus item kecil untuk pembelian tertentu
```

Tombol:

```text
Kustom Promo
Batal
```

Tidak ada lagi:

```text
A. Promo A
B. Promo B
C. Promo C
```

## Alasan

Promo tiap UMKM harus lebih fleksibel. Mystery Box memberi inspirasi, tapi final promo tetap dari owner.

## Render

File deploy:

```text
render.yaml
```

Service type:

```text
worker
```

Start command:

```text
npm start
```

Env wajib:

```text
PHONE_NUMBER
BOT_NUMBER
OWNER_NUMBERS
CUSTOM_PAIRING
```
