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
