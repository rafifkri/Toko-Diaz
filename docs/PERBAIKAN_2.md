# Perbaikan ronde 2

Ditemukan dengan menjalankan kode frontend terhadap **PostgREST + Postgres 16 asli** (`tests/rest`), sesuatu yang tidak terjangkau tes sebelumnya yang memakai mock atau PGlite saja.

| # | Masalah | Dampak | Perbaikan | Tes pengunci |
|---|---|---|---|---|
| 1 | Form **Ubah produk**: input kode memakai `disabled`, sehingga React Hook Form mengembalikan `undefined` dan validasi gagal | Produk **tidak bisa diedit** dari UI | Input `readOnly`; `updateProduct` tidak mengirim `product_code` | `ProductForm.test`, `products.test`, `pages.test` |
| 2 | `updateProduct` mengirim `product_code` ke kolom yang haknya UPDATE-nya sengaja ditutup | `permission denied for table products` | Payload edit hanya berisi kolom yang boleh diubah | `products.test`, `services.test` |
| 3 | `getPurchase` mengurutkan item dengan `created_at`, kolom yang tidak ada di `purchase_items` | **Halaman detail dan edit draft pembelian error** | Urutan dihapus | `services.test`, `pages.test` |
| 4 | Setelah login, `session` terisi sebelum daftar toko selesai dimuat | Halaman "belum terhubung ke toko" **berkedip di setiap login** | `AuthContext` menahan tampilan sampai keanggotaan dimuat (tanpa reload pada token refresh) | `AuthContext.test` (gagal pada kode lama) |
| 5 | Tautan reset sandi memakai `origin` tanpa base path; setelah ganti sandi diarahkan ke `/` | Di GitHub Pages (`/Toko-Diaz/`) tautan reset mengarah ke 404 | Helper `appUrl()` memakai `BASE_URL`; `emailRedirectTo` ikut diatur | `lib.test` |
| 6 | `base` Vite memakai nama repo tertulis tetap | Salah bila nama repo berbeda | Diambil dari `GITHUB_REPOSITORY` | build diverifikasi |
| 7 | `supabase.ts` melempar error saat modul dimuat bila env kosong | **Layar putih** tanpa penjelasan | Layar "Konfigurasi belum lengkap" | `lib.test` |
| 8 | Default satuan dan stok minimum produk baru tidak terpakai bila pengaturan terlambat dimuat | Nilai bawaan salah | Diterapkan ketika pengaturan tiba (selama belum diubah pengguna) | `ProductForm.test` |
| 9 | Tautan reset kedaluwarsa menampilkan pesan teknis "Auth session missing" | Membingungkan | Pesan ramah | - |
| 10 | `pages.yml` berakhir baris CRLF | Rentan di runner Linux | Dinormalkan ke LF | - |

## Hasil verifikasi
`tsc` bersih, ESLint bersih, build biasa dan GitHub Pages berhasil (aset berada di `/Toko-Diaz/`), **167 tes lulus**: 62+ database (PGlite), 59 unit/komponen/regresi, 42 REST terhadap backend asli.

## Yang tidak dapat saya verifikasi
Supabase Auth sungguhan (email konfirmasi/reset, batas kirim email), Edge Function, Storage, serta tampilan di browser dan ponsel.
