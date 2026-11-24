#!/usr/bin/env bash
# Backup logis database Toko Diaz (skema public + data) ke file terkompresi.
# Pakai: DATABASE_URL="postgresql://postgres:***@db.<ref>.supabase.co:5432/postgres" ./scripts/backup.sh [folder]
# Jadwalkan harian (cron / GitHub Actions) dan simpan salinannya di luar Supabase.
# Catatan: file di Storage (foto, QRIS, bukti) TIDAK ikut; unduh terpisah dari dashboard Supabase.
set -euo pipefail
: "${DATABASE_URL:?Isi DATABASE_URL (Supabase > Project Settings > Database > Connection string)}"
DIR="${1:-backups}"; mkdir -p "$DIR"
FILE="$DIR/toko-diaz-$(date +%Y%m%d-%H%M%S).sql.gz"
pg_dump "$DATABASE_URL" --schema=public --no-owner --no-privileges | gzip -9 > "$FILE"
echo "Backup selesai: $FILE ($(du -h "$FILE" | cut -f1))"
find "$DIR" -name 'toko-diaz-*.sql.gz' -mtime +30 -delete   # simpan 30 hari
