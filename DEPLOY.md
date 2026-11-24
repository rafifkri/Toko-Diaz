# Deployment Toko Diaz

## Sebelum mulai
- **Cadangkan database lebih dulu** bila sudah berisi data (`scripts/backup.sh`). Migrasi 0006-0010 mengubah sebagian data lama (lihat `docs/PERBAIKAN.md`).
- Jalankan di project **staging** dahulu, lalu production.

## Langkah
1. Buat project Supabase. Jalankan `supabase/migrations/0001` sampai `0010` **berurutan** (SQL Editor atau `supabase db push`). Jangan lewati nomor.
2. Deploy Edge Function: `supabase functions deploy create-cashier`. Atur secret `ALLOWED_ORIGIN` ke domain produksi (mis. `https://toko-diaz.vercel.app`) dengan `supabase secrets set ALLOWED_ORIGIN=...`. Service Role Key tersedia otomatis di function; jangan pernah ditaruh di frontend.
3. Authentication: atur **Site URL** ke domain produksi dan tambahkan `https://DOMAIN/reset-password` ke *Redirect URLs* (dipakai fitur lupa kata sandi). Konfigurasikan SMTP bila ingin email reset dikirim dari domain sendiri.
4. Frontend (Vercel/Netlify): build `npm run build`, output `dist`. `vercel.json` dan `public/_redirects` sudah menangani rewrite SPA dan header keamanan.
5. Environment variables frontend: hanya `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
6. Pastikan bucket `product-images`, `store-logos`, `qris-images`, `expense-receipts` ada dan **private**.
7. Daftar sebagai owner di `/register` (matikan konfirmasi email jika owner didaftarkan langsung).

## GitHub Pages
Workflow `.github/workflows/pages.yml` membangun dan menerbitkan aplikasi ke GitHub Pages pada push ke `main` atau `master`. Di repository settings, buka **Secrets and variables > Actions** dan tambahkan secrets `VITE_SUPABASE_URL` serta `VITE_SUPABASE_ANON_KEY`. Lalu buka **Pages** dan pilih **GitHub Actions** sebagai build and deployment source. Jangan gunakan Service Role Key di frontend; key publik tetap dilindungi oleh kebijakan RLS database.

## Uji akhir (checklist)
- [ ] Owner: tambah kategori, produk (dengan stok awal + HPP), supplier
- [ ] Pembelian dengan diskon, terima barang, cek HPP rata-rata di detail produk
- [ ] Bayar utang supplier (cicilan lalu lunas)
- [ ] Kasir: buat akun kasir, masuk sebagai kasir, jual tunai (cek kembalian + struk)
- [ ] Transfer dan QRIS: pending, tutup layar, lanjutkan dari Riwayat, konfirmasi; coba "Pembayaran gagal"
- [ ] Refund sebagian lalu sisanya; cek stok dan laporan
- [ ] Kasir membuka `/reports` lewat URL: harus ditolak dengan jelas
- [ ] Stok opname, pengeluaran dengan bukti, laporan + export PDF/Excel/CSV
- [ ] Log Aktivitas memuat semua aksi di atas
- [ ] Coba di ponsel: kasir, riwayat, tabel lebar

## Backup dan pemulihan
- Aktifkan backup harian Supabase (plan berbayar menyediakan PITR). Untuk salinan mandiri: `DATABASE_URL=... ./scripts/backup.sh` (jadwalkan dengan cron atau GitHub Actions; simpan di luar Supabase).
- File Storage (foto, QRIS, bukti) tidak ikut `pg_dump`; unduh terpisah.
- **Uji pemulihan** ke project kosong minimal sekali sebelum go-live: `gunzip -c backup.sql.gz | psql "$DATABASE_URL_TARGET"`.

## CI
`.github/workflows/ci.yml` menjalankan typecheck, lint, seluruh tes (termasuk uji database), dan build pada setiap push/PR.
