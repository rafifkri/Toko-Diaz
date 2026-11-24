export type PresetKey = 'today' | 'week' | '7d' | 'month' | 'last' | 'year' | 'custom'
export type Range = [from: string, to: string]

/** Tanggal lokal (bukan UTC) dalam format YYYY-MM-DD */
export const iso = (d: Date): string => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

export const periodLabels: Record<PresetKey, string> = {
  today: 'Hari ini', week: 'Minggu ini', '7d': '7 hari terakhir', month: 'Bulan ini', last: 'Bulan lalu', year: 'Tahun ini', custom: 'Kustom',
}

/** Minggu dimulai hari Senin (kebiasaan di Indonesia). */
export function presetRange(key: Exclude<PresetKey, 'custom'>, now: Date = new Date()): Range {
  const y = now.getFullYear(), m = now.getMonth()
  switch (key) {
    case 'today': return [iso(now), iso(now)]
    case 'week': { const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); return [iso(monday), iso(now)] }
    case '7d': { const s = new Date(now); s.setDate(now.getDate() - 6); return [iso(s), iso(now)] }
    case 'month': return [iso(new Date(y, m, 1)), iso(now)]
    case 'last': return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))]
    case 'year': return [iso(new Date(y, 0, 1)), iso(now)]
  }
}

export function nextDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return iso(new Date(y, m - 1, d + 1))
}

/** Batas hari (zona Asia/Jakarta) untuk memfilter kolom timestamptz. */
export const startOfDayJakarta = (isoDate: string): string => `${isoDate}T00:00:00+07:00`
export const endOfDayJakarta = (isoDate: string): string => `${nextDay(isoDate)}T00:00:00+07:00`

/** Untuk rentang panjang, grafik harian dikelompokkan per bulan agar tetap terbaca. */
export function bucketDaily(daily: { d: string; sales: number }[], range: Range): { label: string; sales: number }[] {
  const days = (Date.parse(range[1]) - Date.parse(range[0])) / 864e5 + 1
  if (days <= 62) return daily.map(x => ({ label: x.d.slice(5).split('-').reverse().join('/'), sales: x.sales }))
  const byMonth = new Map<string, number>()
  for (const x of daily) { const k = x.d.slice(0, 7); byMonth.set(k, (byMonth.get(k) ?? 0) + x.sales) }
  return [...byMonth].map(([k, v]) => ({ label: k, sales: v }))
}
