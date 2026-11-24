# Toko Diaz POS

Aplikasi kasir, stok, dan keuangan untuk toko keluarga. React 18, TypeScript, Vite, Tailwind, TanStack Query, Zod, Supabase (Postgres + RLS + Edge Function).

## Menjalankan
```bash
npm install
cp .env.example .env        # isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY
# Jalankan supabase/migrations/0001 ... 0010 berurutan hanya pada database kosong
npm run dev
```
Buat akun lewat halaman `/register` (pastikan *Allow new users to sign up* aktif di Supabase), atau lewat Supabase Dashboard → Authentication → Users, lalu masuk di `/login`. Jika belum terhubung ke toko, aplikasi akan meminta nama toko. Jika toko hanya untuk internal, nonaktifkan pendaftaran publik setelah akun pemilik dibuat, dan aktifkan *Confirm email* bila pendaftaran dibuka untuk umum; jangan simpan kredensial demo di kode. Data contoh opsional: `supabase/seed.sql`.

## Masalah saat masuk
Pesan di halaman masuk kini menunjukkan penyebab sebenarnya:

| Pesan | Penyebab dan tindakan |
|---|---|
| Email atau kata sandi salah. | Akun belum ada atau sandi keliru. Buat/atur ulang pengguna di Supabase Dashboard, Authentication, Users |
| Email belum dikonfirmasi. | Konfirmasi email, atau aktifkan *Auto Confirm User* saat membuat pengguna |
| Tidak dapat terhubung ke server. | Periksa internet dan `VITE_SUPABASE_URL` |
| Konfigurasi Supabase tidak valid. | Periksa `VITE_SUPABASE_ANON_KEY`; restart `npm run dev` setelah mengubah `.env` |

Akun contoh seperti `demo@example.com` tidak tersedia secara bawaan; akun harus dibuat sendiri di proyek Supabase Anda.

## Perintah
| Perintah | Fungsi |
|---|---|
| `npm run typecheck` / `npm run lint` | Pemeriksaan tipe dan gaya kode |
| `npm test` | Tes unit dan komponen (Vitest + jsdom) |
| `npm run test:db` | Tes database: migrasi 0001-0010 dijalankan di Postgres (PGlite), menguji RLS, HPP, retur, laporan |
| `npm run test:all` | Semua tes di atas |
| `npm run test:e2e` | Playwright (perlu browser dan akun uji, lihat `tests/e2e`) |
| `npm run build` | Build produksi |

## Dokumentasi
- [`docs/ARSITEKTUR.md`](docs/ARSITEKTUR.md): struktur kode, migrasi, aturan akuntansi
- [`docs/DIAGRAM.md`](docs/DIAGRAM.md): use case, activity, user flow, ERD
- [`docs/PERBAIKAN.md`](docs/PERBAIKAN.md): status setiap perbaikan, apa yang sudah/belum diverifikasi, keterbatasan
- [`DEPLOY.md`](DEPLOY.md): panduan deployment dan backup
