# Arsitektur

## Prinsip
1. **Database adalah sumber kebenaran.** Harga, stok, HPP, nomor dokumen, dan status dihitung di fungsi Postgres (`security definer`); klien tidak pernah mengirim angka yang dipercaya.
2. **Keamanan berlapis.** RLS per toko, hak tulis per kolom (stok/HPP tidak bisa diubah lewat API), tabel transaksi hanya ditulis fungsi, dan penjagaan role di tampilan hanya untuk kenyamanan, bukan batas keamanan.
3. **Setiap perubahan penting meninggalkan jejak**: riwayat stok, audit log otomatis (trigger) dan eksplisit (fungsi).

## Struktur kode (`src/`)
| Folder | Isi |
|---|---|
| `types/` | Tipe domain (mengikuti skema). Tanpa `any`; ESLint menolak `no-explicit-any`. |
| `schemas/` | Skema Zod untuk semua form dan validasi. |
| `services/` | **Satu-satunya** tempat yang memanggil Supabase (query, RPC, storage). Halaman tidak memanggil Supabase langsung. |
| `hooks/` | Hook bersama (debounce, penyimpanan lokal, query yang sering dipakai, cetak struk). |
| `contexts/` | Auth (multi-toko), Toast, Dialog konfirmasi (pengganti `confirm`/`prompt` browser). |
| `components/ui/` | Modal, DataTable, Pagination, DatePicker, Combobox, MoneyInput, feedback (skeleton, kosong, error). |
| `pages/` | Satu folder per modul; halaman owner dimuat lazy. |
| `utils/` | Fungsi murni yang diuji (keranjang, periode, format, struk, CSV, error). |

## Database (`supabase/migrations/`)
| Migrasi | Isi |
|---|---|
| 0001-0005 | Skema awal, modul, refund & laporan, pengguna, laporan per produk. |
| 0006 | Penomoran per toko, penguncian stok/HPP, tabel transaksi tertutup, audit trigger, index. |
| 0007 | Penjualan: uang diterima/kembalian, status gagal, retur sebagian, pengaturan struk. |
| 0008 | Pembelian: alokasi diskon ke HPP, utang & cicilan, edit draft; stok: jenis keluar & opname; pengeluaran: edit, kategori. |
| 0009 | Laporan dan dashboard (bug `get_sales_breakdown` diperbaiki), view produk dengan status stok. |
| 0010 | Role & status anggota, profil, relasi audit ke pengguna. |

Migrasi bersifat *append-only*: 0001-0005 tidak diubah, perbaikan ada di 0006+.

## Aturan akuntansi yang dipakai
- **Penjualan** = transaksi Lunas (termasuk yang kemudian direfund); refund dikurangkan pada tanggal refund.
- **HPP** = rata-rata tertimbang, disalin ke setiap item saat terjual (`unit_cost_snapshot`). Diskon pembelian dialokasikan proporsional ke tiap barang.
- **Laba kotor** = penjualan bersih − HPP; **laba bersih** = laba kotor − pengeluaran aktif. Pembelian bukan beban (persediaan).
- **Arus kas** memakai pembayaran sebenarnya (penjualan lunas, refund, pengeluaran, pembayaran ke supplier).
- Transaksi **Pending** tidak dihitung sebagai penjualan dan tidak mengurangi stok sampai dikonfirmasi.
- Zona waktu pelaporan: **Asia/Jakarta (WIB)**.
