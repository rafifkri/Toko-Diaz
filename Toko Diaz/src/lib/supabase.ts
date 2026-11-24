import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey || /YOUR-/i.test(`${url}${anonKey}`)) {
  throw new Error('Konfigurasi Supabase belum diisi. Setel VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di berkas .env, lalu jalankan ulang server.')
}

export const supabase = createClient(url, anonKey)
