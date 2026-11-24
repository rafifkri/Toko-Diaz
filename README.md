# Toko Diaz POS

Aplikasi kasir, stok, dan keuangan untuk toko keluarga. React 18, TypeScript, Vite, Tailwind, TanStack Query, Zod, Supabase (Postgres + RLS + Edge Function).

## Menjalankan
```bash
npm install
cp .env.example .env        # isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY
# Jalankan supabase/migrations/0001 ... 0010 berurutan hanya pada database kosong
npm run dev
```
Untuk demo, buat akun di Supabase Dashboard → Authentication → Users, lalu masuk di `/login`. Jika belum terhubung ke toko, aplikasi akan meminta nama toko. Nonaktifkan pendaftaran publik di pengaturan Auth; jangan simpan kredensial demo di kode. Data contoh opsional: `supabase/seed.sql`.

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
