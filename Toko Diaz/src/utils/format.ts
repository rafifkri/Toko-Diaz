const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('id-ID')

export const rupiah = (n: number | null | undefined): string => idr.format(Number(n ?? 0))
export const number = (n: number | null | undefined): string => num.format(Number(n ?? 0))

/** Rupiah singkat untuk sumbu grafik: 1,5 jt / 250 rb */
export function rupiahShort(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000_000) return `${trim(n / 1_000_000_000)} M`
  if (a >= 1_000_000) return `${trim(n / 1_000_000)} jt`
  if (a >= 1_000) return `${trim(n / 1_000)} rb`
  return String(n)
}
const trim = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
export const MONTHS_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

/** '2026-11-23' -> '23 Nov 2026' (tanpa konversi zona waktu) */
export function dateLabel(isoDate: string | null | undefined): string {
  if (!isoDate) return '-'
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}
export const dateTimeLabel = (ts: string | null | undefined): string =>
  ts ? new Date(ts).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'

/** '2026-03' -> 'Mar 26' */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`
}
