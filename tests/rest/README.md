# Tes REST (layanan dan halaman terhadap backend sungguhan)

Menjalankan kode `src/services/*` dan merender halaman React terhadap **PostgREST + Postgres asli**, bukan mock.
Ini menangkap bug kontrak yang tidak terlihat oleh tes lain: kolom yang tidak ada di `select`/`order`, embed relasi,
filter `.or()`, upsert `onConflict`, hak akses per kolom, dan RLS lewat JWT.

Tanpa `REST_URL`, tes ini dilewati otomatis (aman untuk CI biasa).

## Menyiapkan (Linux / WSL / Docker)
1. Pasang Postgres 15+ dan PostgREST (https://postgrest.org). Buat database `toko`.
2. Muat penyangga Supabase lalu semua migrasi berurutan:

       psql -d toko -f tests/rest/bootstrap.sql
       for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d toko -f "$f"; done

3. Jalankan PostgREST dengan `pgrst.conf` berikut (JWT secret harus sama dengan harness):

       db-uri = "postgres://authenticator:authpass@localhost:5432/toko"
       db-schemas = "public"
       db-anon-role = "anon"
       jwt-secret = "super-secret-jwt-token-with-at-least-32-characters-long"
       server-port = 3000

4. Jalankan: `REST_URL=http://localhost:3000 npm run test:rest`

Bila `psql` memerlukan perintah khusus (mis. Docker), set `PSQL_CMD`, contoh:
`PSQL_CMD="docker exec -i pg psql -U postgres -d toko"`.
