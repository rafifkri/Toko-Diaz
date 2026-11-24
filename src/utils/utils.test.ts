import { describe, expect, it } from 'vitest'
import { addToCart, reconcileCart, removeItem, setQty, totals, type CartItem } from './cart'
import { errMsg } from './errors'
import { toCsv } from './export'
import { dateLabel, monthLabel, rupiah, rupiahShort } from './format'
import { bucketDaily, endOfDayJakarta, iso, nextDay, presetRange } from './period'
import { buildReceiptHtml } from './receipt'
import { sanitizeSearch } from './search'
import type { Receipt } from '../types'

const p = (o: Partial<{ id: string; stock: number; selling_price: number }> = {}) => ({ id: 'a', product_name: 'Kopi', selling_price: 2000, stock: 5, unit: 'pcs', ...o })

describe('keranjang kasir', () => {
  it('menambah barang dan membatasi jumlah sampai stok', () => {
    let c: CartItem[] = []
    for (let i = 0; i < 9; i++) c = addToCart(c, p())
    expect(c).toHaveLength(1); expect(c[0].qty).toBe(5)
  })
  it('barang habis tidak dapat ditambahkan', () => expect(addToCart([], p({ stock: 0 }))).toEqual([]))
  it('setQty membatasi 1..stok dan menolak nilai tidak valid', () => {
    const c = addToCart([], p())
    expect(setQty(c, 'a', 99)[0].qty).toBe(5); expect(setQty(c, 'a', 0)[0].qty).toBe(1); expect(setQty(c, 'a', NaN)[0].qty).toBe(1)
  })
  it('total: diskon tidak melebihi subtotal dan tidak negatif', () => {
    const c = setQty(addToCart([], p()), 'a', 3)
    expect(totals(c, 1000)).toMatchObject({ subtotal: 6000, discount: 1000, total: 5000, count: 3 })
    expect(totals(c, 99999).total).toBe(0); expect(totals(c, -5).discount).toBe(0)
  })
  it('hapus barang', () => expect(removeItem(addToCart([], p()), 'a')).toEqual([]))
  it('reconcile: harga/stok terbaru dipakai, barang hilang atau habis dibuang', () => {
    const c = setQty(addToCart([], p()), 'a', 4)
    expect(reconcileCart(c, [p({ selling_price: 2500, stock: 2 })])[0]).toMatchObject({ price: 2500, qty: 2, stock: 2 })
    expect(reconcileCart(c, [p({ stock: 0 })])).toEqual([]); expect(reconcileCart(c, [])).toEqual([])
  })
})

describe('format dan periode', () => {
  it('rupiah, singkatan, tanggal', () => {
    expect(rupiah(15000).replace(/\s/g, ' ')).toMatch(/Rp\s?15\.000/)
    expect(rupiahShort(1_500_000)).toBe('1,5 jt'); expect(rupiahShort(250_000)).toBe('250 rb'); expect(rupiahShort(2_000_000_000)).toBe('2 M')
    expect(dateLabel('2026-03-05')).toBe('5 Mar 2026'); expect(dateLabel(null)).toBe('-'); expect(monthLabel('2026-03')).toBe('Mar 26')
  })
  it('iso memakai tanggal lokal, bukan UTC', () => expect(iso(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01'))
  it('preset periode: minggu mulai Senin, tahun ini, bulan lalu', () => {
    const wed = new Date(2026, 10, 25) // Rabu 25 Nov 2026
    expect(presetRange('week', wed)).toEqual(['2026-11-23', '2026-11-25'])
    expect(presetRange('year', wed)).toEqual(['2026-01-01', '2026-11-25'])
    expect(presetRange('last', wed)).toEqual(['2026-10-01', '2026-10-31'])
    expect(presetRange('7d', wed)).toEqual(['2026-11-19', '2026-11-25'])
    expect(presetRange('today', wed)).toEqual(['2026-11-25', '2026-11-25'])
    expect(presetRange('last', new Date(2026, 0, 15))).toEqual(['2025-12-01', '2025-12-31'])
  })
  it('batas hari Jakarta dan hari berikutnya melewati akhir bulan/tahun', () => {
    expect(nextDay('2026-12-31')).toBe('2027-01-01'); expect(endOfDayJakarta('2026-02-28')).toBe('2026-03-01T00:00:00+07:00')
  })
  it('bucketDaily: harian untuk rentang pendek, bulanan untuk rentang panjang', () => {
    const d = [{ d: '2026-01-05', sales: 10 }, { d: '2026-01-20', sales: 5 }, { d: '2026-02-03', sales: 7 }]
    expect(bucketDaily(d, ['2026-01-01', '2026-01-31'])).toHaveLength(3)
    expect(bucketDaily(d, ['2026-01-01', '2026-12-31'])).toEqual([{ label: '2026-01', sales: 15 }, { label: '2026-02', sales: 7 }])
  })
})

describe('keamanan dan ketahanan input', () => {
  it('sanitizeSearch membuang karakter pemisah filter PostgREST', () => expect(sanitizeSearch('a,b)(%*_"x\'')).toBe('a b x'))
  it('CSV: kutip, koma, baris baru, dan injeksi formula', () => {
    const csv = toCsv(['Nama', 'Nilai'], [['a,b', 1], ['"q"', 2], ['=CMD()', 3], ['baris\nbaru', null], [-5 as unknown as string, 0]])
    expect(csv.split('\r\n')[1]).toBe('"a,b",1'); expect(csv).toContain('"""q""",2'); expect(csv).toContain("'=CMD(),3"); expect(csv).toContain('"baris\nbaru",')
    expect(csv).toContain('-5,0') // angka negatif sungguhan tidak diubah
  })
  it('errMsg: pesan bisnis diteruskan, pesan teknis disamarkan', () => {
    expect(errMsg({ message: 'Stok Kopi tidak mencukupi' })).toBe('Stok Kopi tidak mencukupi')
    expect(errMsg({ message: 'duplicate key value violates unique constraint "x"', code: '23505' })).toBe('Data sudah ada.')
    expect(errMsg({ message: 'relation "x" does not exist' })).toBe('Terjadi kesalahan. Coba lagi.')
    expect(errMsg({ message: 'permission denied for table products', code: '42501' })).toMatch(/izin/)
    expect(errMsg(new TypeError('Failed to fetch'))).toMatch(/Koneksi/); expect(errMsg(null)).toBe('Terjadi kesalahan. Coba lagi.')
  })
})

describe('struk', () => {
  const r: Receipt = { id: '1', store: 'Toko <b>Diaz</b>', address: 'Jl. A', phone: '0812', invoice: 'INV-1', date: '2026-11-24T03:00:00Z', cashier: 'Sari', method: 'cash', status: 'paid',
    subtotal: 10000, discount: 1000, total: 9000, received: 10000, change: 1000, refunded: 0, footer: 'Terima kasih <script>x</script>', reference: null,
    items: [{ id: 'i', name: 'Kopi "Gayo"', quantity: 2, price: 5000, subtotal: 10000, returned: 1 }] }
  it('memuat uang diterima, kembalian, dan status', () => {
    const h = buildReceiptHtml(r, 58)
    expect(h).toContain('Uang diterima'); expect(h).toContain('Kembalian'); expect(h).toContain('LUNAS'); expect(h).toContain('retur 1'); expect(h).toContain('size:58mm')
  })
  it('semua teks pengguna di-escape (XSS)', () => {
    const h = buildReceiptHtml(r, 80)
    expect(h).not.toContain('<script>'); expect(h).not.toContain('<b>Diaz'); expect(h).toContain('&lt;b&gt;Diaz'); expect(h).toContain('Kopi &quot;Gayo&quot;')
  })
  it('transfer menampilkan referensi tanpa baris kembalian', () => {
    const h = buildReceiptHtml({ ...r, method: 'transfer', reference: 'TRX9', received: 9000, change: 0 }, 58)
    expect(h).toContain('TRX9'); expect(h).not.toContain('Kembalian')
  })
})
