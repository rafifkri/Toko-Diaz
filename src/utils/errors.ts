interface ErrLike { code?: string; message?: string }

const TECH = /violates|constraint|relation|syntax|column|does not exist|permission denied|duplicate key|null value|invalid input/i

/**
 * Mengubah error database/jaringan menjadi pesan yang aman dan ramah.
 * Pesan bisnis dari fungsi database (RAISE EXCEPTION berbahasa Indonesia) diteruskan apa adanya.
 */
export function errMsg(e: unknown, fallback = 'Terjadi kesalahan. Coba lagi.'): string {
  const err = (e ?? {}) as ErrLike
  const msg = typeof err.message === 'string' ? err.message : ''
  if (err.code === '23503') return 'Data ini masih dipakai di tempat lain.'
  if (err.code === '23505') return 'Data sudah ada.'
  if (err.code === '42501' || /permission denied|row-level security/i.test(msg)) return 'Anda tidak memiliki izin untuk tindakan ini.'
  if (err.code === 'PGRST301' || /jwt expired/i.test(msg)) return 'Sesi berakhir. Silakan masuk kembali.'
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Koneksi bermasalah. Periksa internet Anda.'
  if (msg && msg.length <= 160 && !TECH.test(msg)) return msg
  return fallback
}

interface AuthErrLike { code?: string; status?: number; name?: string; message?: string }

/**
 * Pesan untuk kegagalan masuk (Supabase Auth). Hanya kredensial yang salah yang disebut
 * "email atau kata sandi salah"; penyebab lain (jaringan, konfigurasi, batas percobaan,
 * email belum dikonfirmasi) dibedakan agar mudah ditelusuri.
 */
export function authErrorMessage(e: unknown): string {
  const err = (e ?? {}) as AuthErrLike
  const msg = typeof err.message === 'string' ? err.message : ''
  const code = err.code ?? ''
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return 'Email atau kata sandi salah.'
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) return 'Email belum dikonfirmasi. Periksa kotak masuk Anda.'
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || err.status === 429) return 'Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.'
  if (code === 'user_banned') return 'Akun ini dinonaktifkan. Hubungi pemilik toko.'
  if (err.name === 'AuthRetryableFetchError' || /failed to fetch|networkerror|load failed|fetch/i.test(msg)) return 'Tidak dapat terhubung ke server. Periksa internet atau konfigurasi Supabase.'
  if (code === 'invalid_api_key' || /invalid api key|apikey/i.test(msg)) return 'Konfigurasi Supabase tidak valid (VITE_SUPABASE_ANON_KEY). Periksa berkas .env.'
  return 'Gagal masuk. Coba lagi.'
}

/** Pesan untuk kegagalan pendaftaran akun; kasus lain jatuh ke pesan umum Supabase Auth. */
export function signUpErrorMessage(e: unknown): string {
  const err = (e ?? {}) as AuthErrLike
  const msg = typeof err.message === 'string' ? err.message : ''
  const code = err.code ?? ''
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(msg)) return 'Email sudah terdaftar. Silakan masuk.'
  if (code === 'signup_disabled' || /signups? not allowed|signup is disabled/i.test(msg)) return 'Pendaftaran akun baru sedang ditutup.'
  if (code === 'weak_password' || /password should be/i.test(msg)) return 'Kata sandi terlalu lemah. Gunakan kombinasi yang lebih panjang.'
  if (code === 'validation_failed' || code === 'email_address_invalid') return 'Email tidak valid.'
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || err.status === 429) return 'Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.'
  if (err.name === 'AuthRetryableFetchError' || /failed to fetch|networkerror|load failed/i.test(msg)) return 'Tidak dapat terhubung ke server. Periksa internet Anda.'
  return 'Pendaftaran gagal. Coba lagi.'
}
