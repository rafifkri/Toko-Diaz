import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Terisi bila .env belum diisi. Ditampilkan sebagai layar penjelasan (bukan layar putih) oleh main.tsx. */
export const configError: string | null =
  !url || !anonKey || /YOUR-/i.test(`${url}${anonKey}`)
    ? 'Konfigurasi Supabase belum diisi. Setel VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di berkas .env (atau Secrets GitHub untuk deploy), lalu jalankan ulang / build ulang.'
    : null

// Saat konfigurasi kosong, klien tetap dibuat dengan nilai sementara agar modul dapat dimuat; aplikasi tidak dirender.
export const supabase = createClient(configError ? 'https://invalid.supabase.co' : url, configError ? 'invalid' : anonKey)
