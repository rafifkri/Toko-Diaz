# Pemetaan perbaikan dan kekurangan

Status jujur setiap butir dari daftar awal. **Terverifikasi** = dijalankan di sini (tes otomatis, tsc, build).
**Ditulis, belum diverifikasi** = kode ada dan lolos tsc/lint/build, tetapi perlu dicoba di lingkungan nyata (Supabase asli, browser, perangkat).

## A. Masalah di kode lama

| # | Masalah | Perbaikan | Status |
|---|---|---|---|
| 1 | `get_sales_breakdown` bertipe stable tetapi membuat tabel sementara | Dibuat ulang dengan CTE murni (0009). Error asli direproduksi di Postgres: *"CREATE TABLE AS is not allowed in a non-volatile function"* | Terverifikasi |
| 2 | Diskon pembelian tidak masuk HPP | Diskon dibagi proporsional ke tiap barang saat diterima; disimpan di `purchase_items.allocated_cost` (0008) | Terverifikasi (HPP 900/2.700 dari diskon 10%; nilai persediaan = uang keluar) |
| 3 | Owner bisa ubah `stock` / `average_cost` lewat API | Hak tulis per kolom: `stock`, `average_cost`, `purchase_price` tidak bisa di-INSERT/UPDATE klien (0006). Temuan tambahan: owner juga bisa membalik status `purchases` langsung dan mengubah `owner_id` toko / role anggota. Semuanya ditutup | Terverifikasi |
| 4 | Transaksi pending tidak bisa dilanjutkan | Riwayat Penjualan: Lanjutkan pembayaran, Batalkan; layar bayar juga punya Konfirmasi dan "Pembayaran gagal"; banner pending di Kasir | Fungsi DB terverifikasi; UI ditulis, belum diverifikasi di browser |
| 5 | Kasir mendarat di Dashboard owner; tanpa penjagaan role | Beranda kasir sendiri; `RequireOwner` menampilkan halaman penolakan jelas; menu kasir tanpa menu owner | Terverifikasi (tes integrasi, 9 URL owner) |
| 6 | Penomoran global | Penomoran per toko per hari (`doc_counters`), nomor tidak melompat | Terverifikasi |
| 7 | Audit log hanya 4 aksi | Kini mencakup penjualan, konfirmasi/batal/gagal, refund (penuh/sebagian), pembelian (buat/ubah/terima/bayar), stok, opname, pengeluaran, harga/nama/status produk, QRIS & pembayaran, pengguna, profil toko. Halaman **Log Aktivitas** (owner) dengan filter dan diff sebelum/sesudah | Terverifikasi (DB); halaman ditulis, belum diverifikasi di browser |
| 8 | Struktur kode menyimpang dari spesifikasi | `services/`, `hooks/`, `types/`, `schemas/` (Zod di semua form); nol `any` (dijaga ESLint) | Terverifikasi (tsc + eslint bersih) |

## B. Modul yang kurang

| Modul | Hasil | Status |
|---|---|---|
| Dashboard | 4 kartu bulan ini, 4 grafik (penjualan bulanan, penjualan vs pembelian, pengeluaran per kategori, laba kotor vs bersih), transaksi terbaru, terlaris, stok terendah, pembelian terbaru, ikon notifikasi stok menipis | Fungsi DB terverifikasi; tampilan belum diverifikasi |
| Produk & kategori | Detail produk, filter kategori/status stok/aktif, paginasi server, form tambah lengkap (kategori, barcode, foto, stok awal + HPP), edit kategori | Ditulis |
| Supplier & pembelian | Edit supplier, riwayat & detail per supplier, pembayaran utang (cicilan) + `purchase_payments`, form dengan tanggal/metode/catatan/jatuh tempo, detail pembelian, edit draft | DB terverifikasi; UI ditulis |
| Kasir & pembayaran | Uang diterima & kembalian (disimpan), referensi transfer, rekening toko, aktif/nonaktif metode (dicek di UI **dan** database), logo di layar QRIS, status Gagal, cetak struk setelah transaksi (opsi otomatis), keranjang tahan refresh | DB terverifikasi; UI ditulis |
| Riwayat & refund | Retur sebagian (`sale_return_items`), filter metode/status/tanggal, detail isi transaksi, paginasi server | DB terverifikasi; UI ditulis |
| Stok | Jenis keluar rusak/hilang, filter & paginasi riwayat, stok opname dengan riwayat | DB terverifikasi; UI ditulis |
| Pengeluaran | Edit, upload bukti (PNG/JPG), filter tanggal & kategori, detail, kategori dikelola, metode pembayaran | DB terverifikasi; UI ditulis |
| Laporan | Minggu/tahun, filter supplier/produk/kategori/metode/status, rata-rata transaksi, riwayat pembelian + status penerimaan, tampilan pending, export CSV/Excel/**PDF sungguhan** (jsPDF) | DB terverifikasi; export belum dicoba di browser |
| Pengaturan & pengguna | Pengaturan struk (footer, lebar, cetak otomatis), pengaturan stok, reset sandi kasir (edge function), ubah role, profil, lupa/reset sandi, pemilihan toko | Lihat catatan di bawah |

**Catatan:** reset sandi kasir (edge function) dan lupa sandi (email) butuh Supabase asli. Pemilihan toko: pemilih di header sudah ada dan memakai seluruh keanggotaan akun, tetapi `create_store` sengaja masih membatasi satu toko per akun; menambah toko kedua memerlukan keputusan produk Anda.

## C. UI dan kualitas

| Butir | Hasil | Status |
|---|---|---|
| Modal, toast, dialog konfirmasi | `Modal`, `ToastProvider`, `DialogProvider` (confirm/prompt berbasis promise). Tidak ada lagi `confirm()`/`prompt()`/`alert()` bawaan browser | Terverifikasi (grep + tes komponen) |
| Loading/kosong/error konsisten | Semua tabel lewat `DataTable` (skeleton, ilustrasi kosong, error + coba lagi) | Terverifikasi (tes komponen) |
| Date picker | Komponen kalender sendiri (bahasa Indonesia, minggu mulai Senin, min/max) | Terverifikasi (tes komponen) |
| Responsif ponsel | Kelas mobile-first, keranjang kasir sebagai lembar bawah, tabel scroll horizontal, drawer menu, safe-area | **Belum dilihat di browser/perangkat** |
| Poles visual | Favicon, logo, halaman masuk bermerek, animasi halus (hormati *reduced motion*), skeleton, ilustrasi keadaan kosong | Ditulis; **belum ditinjau secara visual** |

## D. Dokumentasi, pengujian, deployment

| Butir | Hasil | Status |
|---|---|---|
| Diagram Phase 1 | `docs/DIAGRAM.md`: use case, 3 activity diagram, user flow, ERD (Mermaid) | Selesai |
| Lima keputusan bagian 15 | **Dokumen bagian 15 tidak ada pada berkas yang saya terima**, jadi tidak disentuh | Belum |
| `npm install`, `tsc`, build, migrasi | Semua dijalankan: `tsc` bersih, ESLint bersih, `vite build` sukses, 10 migrasi termuat di Postgres (PGlite) | Terverifikasi |
| Uji database | 66 tes: isolasi RLS antar toko, role, penguncian stok/HPP, Storage, HPP & laba, retur, pembelian, penomoran, audit, laporan | Terverifikasi |
| Uji frontend | 36 tes: utilitas, skema, komponen, penjagaan role | Terverifikasi |
| e2e | Spesifikasi Playwright ada (`tests/e2e`) | **Belum dijalankan** (butuh browser + Supabase uji) |
| Optimasi | 16 index baru, code splitting per rute (+ Excel/PDF/grafik dimuat saat dipakai), paginasi server | Index berdasar pola query; **belum diukur dengan `EXPLAIN` pada data besar** |
| Deployment | `DEPLOY.md` diperbarui, CI GitHub Actions, `vercel.json`, `scripts/backup.sh` | Deploy, domain, dan jadwal backup **belum dilakukan** (butuh akun Anda) |

## Keterbatasan yang perlu Anda ketahui
- Zona waktu pelaporan dikunci **Asia/Jakarta**; toko di WITA/WIT akan melihat batas hari bergeser.
- Pemilih produk memuat hingga 1.000 produk aktif; di atas itu perlu pencarian sisi server.
- Export "Transaksi" memuat maksimal 500 baris terbaru sesuai filter.
- Paket `xlsx` dari npm (0.18.5) punya advisori keamanan lama; dipakai untuk import file dari owner sendiri. Pertimbangkan versi dari CDN SheetJS bila menerima file dari pihak lain.
- Migrasi memodifikasi data lama (pembelian lunas lama dibuatkan catatan pembayaran; retur lama dibuatkan baris item). **Cadangkan database sebelum menjalankan 0006-0010** pada data nyata.
