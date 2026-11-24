# Diagram Phase 1

Semua diagram memakai Mermaid (tampil otomatis di GitHub, GitLab, dan VS Code dengan ekstensi Mermaid).
Diagram mengikuti perilaku yang **diimplementasikan dan diuji** di migrasi 0001-0010.

## 1. Use case

```mermaid
flowchart LR
  K([Kasir]) --- UC1(Berjualan: tunai / transfer / QRIS)
  K --- UC2(Lanjutkan, konfirmasi, batalkan transaksi pending)
  K --- UC3(Cetak struk)
  K --- UC4(Lihat riwayat transaksi sendiri)
  K --- UC5(Ubah profil dan kata sandi)
  O([Owner]) --- UC1
  O --- UC4b(Riwayat seluruh transaksi)
  O --- UC6(Refund penuh / sebagian)
  O --- UC7(Kelola produk, kategori, supplier)
  O --- UC8(Pembelian, terima barang, bayar utang)
  O --- UC9(Penyesuaian stok dan stok opname)
  O --- UC10(Pengeluaran dan bukti transaksi)
  O --- UC11(Dashboard dan laporan, export CSV/Excel/PDF)
  O --- UC12(Kelola kasir: tambah, reset sandi, role, nonaktif)
  O --- UC13(Pengaturan toko, pembayaran, struk, stok)
  O --- UC14(Lihat log aktivitas)
  O --- UC5
```

## 2. Activity: penjualan

```mermaid
flowchart TD
  A[Kasir memilih produk / scan barcode] --> B[Keranjang tersimpan otomatis]
  B --> C{Metode pembayaran aktif?}
  C -- tidak --> C1[Metode dinonaktifkan: pilih metode lain]
  C -- ya --> D{Tunai?}
  D -- ya --> E[Isi uang diterima: kembalian dihitung]
  E --> F[create_sale: validasi stok, harga dari database]
  F --> G[Stok berkurang, HPP disalin ke item, status Lunas]
  G --> H[Struk dapat dicetak / otomatis]
  D -- tidak --> I[create_sale: status Pending, stok belum berkurang]
  I --> J[Layar QRIS atau rekening, input referensi]
  J --> K{Hasil}
  K -- dana masuk --> L[confirm_payment: stok berkurang, Lunas]
  K -- tidak masuk --> M[fail_pending_sale: Gagal]
  K -- batal --> N[cancel_pending_sale: Dibatalkan]
  K -- ditutup --> O[Tetap Pending: lanjutkan dari Riwayat]
  L --> H
```

## 3. Activity: pembelian, HPP, dan utang

```mermaid
flowchart TD
  A[Buat pembelian: tanggal, metode, catatan, barang, diskon] --> B[(Draft)]
  B --> B1[Ubah draft] --> B
  B --> X[Batalkan draft]
  B --> C[Terima barang: receive_purchase]
  C --> D[Diskon dibagi proporsional ke tiap barang]
  D --> E[HPP rata-rata tertimbang dihitung, stok bertambah, riwayat stok ditulis]
  E --> F{Bayar lunas saat diterima?}
  F -- ya --> G[Pembayaran tercatat, status Lunas]
  F -- tidak --> H[Utang supplier]
  H --> I[pay_purchase: cicilan atau pelunasan]
  I --> J{Sisa utang 0?}
  J -- tidak --> K[Status Dicicil] --> I
  J -- ya --> G
```

## 4. Activity: refund / retur sebagian

```mermaid
flowchart TD
  A[Owner buka detail transaksi Lunas] --> B[Pilih barang dan jumlah retur, alasan, restock?]
  B --> C[refund_sale: jumlah tidak boleh melebihi sisa terjual]
  C --> D[Nilai refund = harga item x jumlah x rasio diskon transaksi]
  D --> E{Restock?}
  E -- ya --> F[Stok bertambah, HPP dibalik proporsional]
  E -- tidak --> G[Stok tetap]
  F --> H{Semua barang sudah diretur?}
  G --> H
  H -- ya --> I[Status Direfund, total refund = total transaksi]
  H -- tidak --> J[Status tetap Lunas, refunded_amount bertambah]
```

## 5. User flow per role

```mermaid
flowchart TD
  L[Masuk] --> R{Role}
  R -- Kasir --> K1[Beranda kasir: ringkasan hari ini]
  K1 --> K2[Kasir / POS] --> K3[Riwayat sendiri: lanjutkan pending, cetak]
  K1 --> K4[Profil]
  R -- Owner --> O1[Dashboard: kartu, grafik, daftar]
  O1 --> O2[Produk / Kategori / Supplier]
  O1 --> O3[Pembelian]
  O1 --> O4[Stok: penyesuaian, opname, riwayat]
  O1 --> O5[Pengeluaran]
  O1 --> O6[Laporan]
  O1 --> O7[Pengguna]
  O1 --> O8[Log aktivitas]
  O1 --> O9[Pengaturan]
  K1 -. URL halaman owner .-> F[Halaman penolakan jelas]
```

## 6. ERD

```mermaid
erDiagram
  profiles ||--o{ store_users : "anggota"
  stores ||--o{ store_users : ""
  stores ||--|| store_settings : ""
  stores ||--o{ store_payment_settings : ""
  stores ||--o{ categories : ""
  stores ||--o{ products : ""
  stores ||--o{ suppliers : ""
  stores ||--o{ doc_counters : "penomoran per toko"
  categories ||--o{ products : ""
  products ||--o{ stock_movements : "riwayat stok"
  products ||--o{ sale_items : ""
  products ||--o{ purchase_items : ""
  products ||--o{ stock_opname_items : ""
  stores ||--o{ sales : ""
  sales ||--|{ sale_items : ""
  sales ||--o{ payments : ""
  sales ||--o{ sale_returns : "retur (bisa banyak)"
  sale_returns ||--|{ sale_return_items : ""
  sale_items ||--o{ sale_return_items : ""
  suppliers ||--o{ purchases : ""
  purchases ||--|{ purchase_items : ""
  purchases ||--o{ purchase_payments : "cicilan"
  stores ||--o{ stock_opnames : ""
  stock_opnames ||--|{ stock_opname_items : ""
  stores ||--o{ expenses : ""
  stores ||--o{ expense_categories : ""
  stores ||--o{ audit_logs : ""
  profiles ||--o{ audit_logs : "pelaku"

  products { uuid id PK
    int stock "hanya lewat fungsi"
    numeric average_cost "hanya lewat fungsi"
    bigint selling_price }
  sales { uuid id PK
    text invoice_number "unik per toko"
    bigint total_amount
    bigint received_amount
    bigint change_amount
    bigint refunded_amount
    text payment_status "pending paid failed cancelled refunded" }
  sale_items { numeric unit_cost_snapshot "HPP saat terjual" }
  purchases { text receiving_status "draft received cancelled"
    text payment_status "unpaid partial paid"
    bigint paid_amount }
  purchase_items { numeric allocated_cost "HPP setelah alokasi diskon" }
```
