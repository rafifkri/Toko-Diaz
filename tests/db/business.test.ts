import { beforeAll, describe, expect, it } from 'vitest'
import { asUser, createDb, newUser, type Db } from './harness'

/** Uji perhitungan HPP, laba, retur, pembelian, penomoran, dan laporan terhadap Postgres sungguhan. */
let db: Db
let owner: string, cashier: string, owner2: string
let store: string, store2: string
let kopi: string, gula: string

const J = JSON.stringify
const sale = async (uid: string, items: { product_id: string; quantity: number }[], method = 'cash', received: number | null = 1_000_000, discount = 0) =>
  (await asUser<{ create_sale: string }>(db, uid, `select create_sale($1, $2::jsonb, $3, $4, null, $5)`, [store, J(items), discount, method, received]))[0].create_sale
const product = async (code: string) =>
  (await asUser<{ stock: number; average_cost: string }>(db, owner, `select stock, average_cost from products_owner where product_code = $1`, [code]))[0]
const report = async () => (await asUser<{ r: Record<string, number> }>(db, owner, `select get_financial_report($1, '2000-01-01', '2100-01-01') r`, [store]))[0].r

beforeAll(async () => {
  db = await createDb()
  owner = await newUser(db, 'o@toko.id', 'Owner')
  cashier = await newUser(db, 'k@toko.id', 'Kasir')
  owner2 = await newUser(db, 'o2@toko.id', 'Owner 2')
  store = (await asUser<{ create_store: string }>(db, owner, `select create_store('Toko Diaz')`))[0].create_store
  store2 = (await asUser<{ create_store: string }>(db, owner2, `select create_store('Toko Lain')`))[0].create_store
  await db.query(`insert into store_users (store_id, user_id, role) values ($1, $2, 'cashier')`, [store, cashier])
  kopi = (await asUser<{ id: string }>(db, owner, `insert into products (store_id, product_code, product_name, selling_price, minimum_stock) values ($1,'KOPI','Kopi',2000,5) returning id`, [store]))[0].id
  gula = (await asUser<{ id: string }>(db, owner, `insert into products (store_id, product_code, product_name, selling_price, minimum_stock) values ($1,'GULA','Gula',5000,5) returning id`, [store]))[0].id
}, 120_000)

describe('pembelian dan HPP', () => {
  let p1: string
  it('diskon pembelian dialokasikan ke HPP (nilai persediaan = uang yang keluar)', async () => {
    // Kopi 10 x 1000 + Gula 10 x 3000 = 40.000; diskon 4.000 (10%) -> total 36.000
    p1 = (await asUser<{ create_purchase: string }>(db, owner, `select create_purchase($1, null, $2::jsonb, 4000, false)`,
      [store, J([{ product_id: kopi, quantity: 10, unit_cost: 1000 }, { product_id: gula, quantity: 10, unit_cost: 3000 }])]))[0].create_purchase
    await asUser(db, owner, `select receive_purchase($1)`, [p1])
    const k = await product('KOPI'), g = await product('GULA')
    expect(Number(k.average_cost)).toBeCloseTo(900, 4)
    expect(Number(g.average_cost)).toBeCloseTo(2700, 4)
    expect(k.stock).toBe(10)
    // nilai persediaan sama dengan total yang dibayar
    expect(10 * Number(k.average_cost) + 10 * Number(g.average_cost)).toBeCloseTo(36000, 2)
  })
  it('pembelian kedua memakai rata-rata tertimbang', async () => {
    const p = (await asUser<{ create_purchase: string }>(db, owner, `select create_purchase($1, null, $2::jsonb, 0, true)`,
      [store, J([{ product_id: kopi, quantity: 10, unit_cost: 1100 }])]))[0].create_purchase
    await asUser(db, owner, `select receive_purchase($1)`, [p])
    expect(Number((await product('KOPI')).average_cost)).toBeCloseTo(1000, 4) // (10*900 + 10*1100) / 20
    expect((await product('KOPI')).stock).toBe(20)
  })
  it('pembelian tidak dapat diterima dua kali', async () => {
    await expect(asUser(db, owner, `select receive_purchase($1)`, [p1])).rejects.toThrow(/sudah diproses/)
  })
  it('pembelian dengan p_paid langsung tercatat lunas saat diterima', async () => {
    const r = await asUser<{ payment_status: string; paid_amount: string }>(db, owner, `select payment_status, paid_amount from purchases where total_amount = 11000`)
    expect(r[0]).toMatchObject({ payment_status: 'paid', paid_amount: 11000 })
  })
  it('edit draft mengganti item dan total', async () => {
    const d = (await asUser<{ create_purchase: string }>(db, owner, `select create_purchase($1, null, $2::jsonb, 0, false)`,
      [store, J([{ product_id: gula, quantity: 1, unit_cost: 100 }])]))[0].create_purchase
    await asUser(db, owner, `select update_purchase_draft($1, null, $2::jsonb, 50, false, current_date, 'transfer', 'catatan', null)`,
      [d, J([{ product_id: gula, quantity: 4, unit_cost: 500 }])])
    const r = await asUser<{ total_amount: string; payment_method: string; notes: string }>(db, owner, `select total_amount, payment_method, notes from purchases where id = $1`, [d])
    expect(r[0]).toMatchObject({ total_amount: 1950, payment_method: 'transfer', notes: 'catatan' })
    await asUser(db, owner, `select cancel_purchase($1)`, [d])
    await expect(asUser(db, owner, `select update_purchase_draft($1, null, $2::jsonb, 0, false, current_date, 'cash', null, null)`,
      [d, J([{ product_id: gula, quantity: 1, unit_cost: 1 }])])).rejects.toThrow(/draft/)
  })
  it('utang supplier dapat dicicil sampai lunas dan tidak boleh melebihi sisa', async () => {
    expect((await asUser<{ payment_status: string }>(db, owner, `select payment_status from purchases where id = $1`, [p1]))[0].payment_status).toBe('unpaid')
    await asUser(db, owner, `select pay_purchase($1, 10000, 'cash', current_date, 'cicilan 1')`, [p1])
    expect((await asUser<{ payment_status: string }>(db, owner, `select payment_status from purchases where id = $1`, [p1]))[0].payment_status).toBe('partial')
    await expect(asUser(db, owner, `select pay_purchase($1, 99999, 'cash')`, [p1])).rejects.toThrow(/melebihi sisa/)
    await asUser(db, owner, `select pay_purchase($1, 26000, 'transfer')`, [p1])
    const r = await asUser<{ payment_status: string; paid_amount: string }>(db, owner, `select payment_status, paid_amount from purchases where id = $1`, [p1])
    expect(r[0]).toMatchObject({ payment_status: 'paid', paid_amount: 36000 })
    await expect(asUser(db, owner, `select pay_purchase($1, 1)`, [p1])).rejects.toThrow(/melebihi sisa/)
    expect((await asUser(db, owner, `select id from purchase_payments where purchase_id = $1`, [p1]))).toHaveLength(2)
  })
  it('pembayaran hanya untuk pembelian yang sudah diterima', async () => {
    const d = (await asUser<{ create_purchase: string }>(db, owner, `select create_purchase($1, null, $2::jsonb, 0, false)`,
      [store, J([{ product_id: gula, quantity: 1, unit_cost: 100 }])]))[0].create_purchase
    await expect(asUser(db, owner, `select pay_purchase($1, 100)`, [d])).rejects.toThrow(/sudah diterima/)
  })
})

describe('penjualan, pembayaran, dan penomoran', () => {
  it('stok dan HPP snapshot tercatat saat tunai', async () => {
    const s = await sale(owner, [{ product_id: kopi, quantity: 4 }], 'cash', 10000)
    expect((await product('KOPI')).stock).toBe(16)
    const it = await asUser<{ unit_cost_snapshot: string }>(db, owner, `select unit_cost_snapshot from sale_items where sale_id = $1`, [s])
    expect(Number(it[0].unit_cost_snapshot)).toBeCloseTo(1000, 4)
    const hdr = await asUser<{ received_amount: string; change_amount: string }>(db, owner, `select received_amount, change_amount from sales where id = $1`, [s])
    expect(hdr[0]).toMatchObject({ received_amount: 10000, change_amount: 2000 })
  })
  it('uang diterima kurang ditolak dan tidak meninggalkan transaksi', async () => {
    const before = (await db.query<{ c: number }>(`select count(*)::int c from sales`)).rows[0].c
    await expect(sale(owner, [{ product_id: kopi, quantity: 1 }], 'cash', 1000)).rejects.toThrow(/kurang/)
    expect((await db.query<{ c: number }>(`select count(*)::int c from sales`)).rows[0].c).toBe(before)
  })
  it('stok tidak mencukupi ditolak', async () => {
    await expect(sale(owner, [{ product_id: kopi, quantity: 9999 }])).rejects.toThrow(/tidak mencukupi/)
  })
  it('harga selalu dari database, bukan dari klien', async () => {
    const s = await sale(owner, [{ product_id: kopi, quantity: 1 }], 'cash', 2000)
    expect((await asUser<{ total_amount: number }>(db, owner, `select total_amount from sales where id = $1`, [s]))[0].total_amount).toBe(2000)
  })
  it('diskon melebihi subtotal ditolak', async () => {
    await expect(sale(owner, [{ product_id: kopi, quantity: 1 }], 'cash', 5000, 99999)).rejects.toThrow(/Diskon/)
  })
  it('transfer: pending tidak mengurangi stok, konfirmasi mengurangi tepat sekali', async () => {
    const stock0 = (await product('KOPI')).stock
    const s = await sale(cashier, [{ product_id: kopi, quantity: 2 }], 'transfer', null)
    expect((await product('KOPI')).stock).toBe(stock0)
    await asUser(db, cashier, `select confirm_payment($1, 'TRX-123')`, [s])
    expect((await product('KOPI')).stock).toBe(stock0 - 2)
    await expect(asUser(db, cashier, `select confirm_payment($1)`, [s])).rejects.toThrow(/sudah diproses/)
    expect((await product('KOPI')).stock).toBe(stock0 - 2)
    const ref = await asUser<{ payment_reference: string; payment_status: string }>(db, owner, `select payment_reference, payment_status from payments where sale_id = $1`, [s])
    expect(ref[0]).toMatchObject({ payment_reference: 'TRX-123', payment_status: 'paid' })
  })
  it('QRIS tanpa gambar belum aktif secara bawaan', async () => {
    await expect(sale(cashier, [{ product_id: kopi, quantity: 1 }], 'qris', null)).rejects.toThrow(/QRIS sedang dinonaktifkan/)
    await asUser(db, owner, `update store_payment_settings set is_active = true where store_id = $1 and payment_method = 'qris'`, [store])
  })
  it('transaksi pending dapat ditandai gagal atau dibatalkan, tetapi tidak setelah lunas', async () => {
    const a = await sale(cashier, [{ product_id: kopi, quantity: 1 }], 'qris', null)
    await asUser(db, cashier, `select fail_pending_sale($1, 'Dana tidak masuk')`, [a])
    expect((await asUser<{ payment_status: string }>(db, owner, `select payment_status from sales where id = $1`, [a]))[0].payment_status).toBe('failed')
    await expect(asUser(db, cashier, `select confirm_payment($1)`, [a])).rejects.toThrow(/sudah diproses/)
    const b = await sale(cashier, [{ product_id: kopi, quantity: 1 }], 'qris', null)
    await asUser(db, cashier, `select cancel_pending_sale($1)`, [b])
    const c = await sale(owner, [{ product_id: kopi, quantity: 1 }], 'cash', 2000)
    await expect(asUser(db, owner, `select cancel_pending_sale($1)`, [c])).rejects.toThrow(/pending/)
    await expect(asUser(db, owner, `select fail_pending_sale($1)`, [c])).rejects.toThrow(/pending/)
  })
  it('metode pembayaran yang dinonaktifkan ditolak oleh database', async () => {
    await asUser(db, owner, `update store_payment_settings set is_active = false where store_id = $1 and payment_method = 'transfer'`, [store])
    await expect(sale(cashier, [{ product_id: kopi, quantity: 1 }], 'transfer', null)).rejects.toThrow(/dinonaktifkan/)
    await asUser(db, owner, `update store_payment_settings set is_active = true where store_id = $1 and payment_method = 'transfer'`, [store])
  })
  it('nomor dokumen per toko: toko kedua mulai dari 00001 dan tidak ikut melompat', async () => {
    const p2 = (await asUser<{ id: string }>(db, owner2, `insert into products (store_id, product_code, product_name, selling_price) values ($1,'X','X',1000) returning id`, [store2]))[0].id
    await asUser(db, owner2, `select adjust_stock($1, 10, 'awal', 'adjustment', 500)`, [p2])
    const s = (await asUser<{ create_sale: string }>(db, owner2, `select create_sale($1, $2::jsonb, 0, 'cash', null, 1000)`, [store2, J([{ product_id: p2, quantity: 1 }])]))[0].create_sale
    const inv = (await asUser<{ invoice_number: string }>(db, owner2, `select invoice_number from sales where id = $1`, [s]))[0].invoice_number
    expect(inv).toMatch(/^INV-\d{6}-00001$/)
    const mine = await asUser<{ invoice_number: string }>(db, owner, `select invoice_number from sales order by invoice_number`)
    const nums = mine.map(r => Number(r.invoice_number.split('-')[2]))
    expect(nums).toEqual(Array.from({ length: nums.length }, (_, i) => i + 1)) // berurutan tanpa celah
  })
})

describe('retur sebagian dan penuh', () => {
  let s: string, itemId: string
  it('retur sebagian dengan restock menambah stok dan membalik HPP proporsional', async () => {
    s = await sale(owner, [{ product_id: gula, quantity: 4 }], 'cash', 100000, 2000) // subtotal 20.000, diskon 2.000, total 18.000
    itemId = (await asUser<{ id: string }>(db, owner, `select id from sale_items where sale_id = $1`, [s]))[0].id
    const stock0 = (await product('GULA')).stock
    await asUser(db, owner, `select refund_sale($1, 'Rusak', true, $2::jsonb)`, [s, J([{ sale_item_id: itemId, quantity: 1 }])])
    expect((await product('GULA')).stock).toBe(stock0 + 1)
    const r = await asUser<{ payment_status: string; refunded_amount: string }>(db, owner, `select payment_status, refunded_amount from sales where id = $1`, [s])
    expect(r[0]).toMatchObject({ payment_status: 'paid', refunded_amount: 4500 }) // 5.000 x (18.000 / 20.000)
  })
  it('jumlah retur tidak boleh melebihi yang terjual', async () => {
    await expect(asUser(db, owner, `select refund_sale($1, 'x', true, $2::jsonb)`, [s, J([{ sale_item_id: itemId, quantity: 4 }])])).rejects.toThrow(/melebihi/)
  })
  it('retur sisa membuat transaksi berstatus refunded dengan total refund = total transaksi', async () => {
    await asUser(db, owner, `select refund_sale($1, 'Sisa dikembalikan', false)`, [s])
    const r = await asUser<{ payment_status: string; refunded_amount: string }>(db, owner, `select payment_status, refunded_amount from sales where id = $1`, [s])
    expect(r[0]).toMatchObject({ payment_status: 'refunded', refunded_amount: 18000 })
    const pay = await asUser<{ payment_status: string }>(db, owner, `select payment_status from payments where sale_id = $1`, [s])
    expect(pay[0].payment_status).toBe('refunded')
    await expect(asUser(db, owner, `select refund_sale($1, 'lagi', true)`, [s])).rejects.toThrow(/lunas/)
  })
  it('alasan wajib diisi', async () => {
    const t = await sale(owner, [{ product_id: kopi, quantity: 1 }], 'cash', 2000)
    await expect(asUser(db, owner, `select refund_sale($1, '  ', true)`, [t])).rejects.toThrow(/Alasan/)
  })
})

describe('stok: jenis keluar dan opname', () => {
  it('stok rusak dan hilang tercatat dengan jenis masing-masing', async () => {
    await asUser(db, owner, `select adjust_stock($1, -1, 'pecah', 'damage_out')`, [gula])
    await asUser(db, owner, `select adjust_stock($1, -1, 'tidak ketemu', 'lost_out')`, [gula])
    const t = await asUser<{ movement_type: string }>(db, owner, `select movement_type from stock_movements where product_id = $1 and movement_type in ('damage_out','lost_out') order by created_at`, [gula])
    expect(t.map(x => x.movement_type)).toEqual(['damage_out', 'lost_out'])
  })
  it('validasi jenis, nilai nol, stok negatif, dan alasan', async () => {
    await expect(asUser(db, owner, `select adjust_stock($1, 5, 'x', 'damage_out')`, [gula])).rejects.toThrow(/negatif/)
    await expect(asUser(db, owner, `select adjust_stock($1, 0, 'x')`, [gula])).rejects.toThrow(/nol/)
    await expect(asUser(db, owner, `select adjust_stock($1, -99999, 'x')`, [gula])).rejects.toThrow(/negatif/)
    await expect(asUser(db, owner, `select adjust_stock($1, -1, '')`, [gula])).rejects.toThrow(/Alasan/)
    await expect(asUser(db, owner, `select adjust_stock($1, -1, 'x', 'ngawur')`, [gula])).rejects.toThrow(/Jenis/)
  })
  it('stok masuk dengan HPP memakai rata-rata tertimbang', async () => {
    const p = (await asUser<{ id: string }>(db, owner, `insert into products (store_id, product_code, product_name, selling_price) values ($1,'NEW','Baru',100) returning id`, [store]))[0].id
    await asUser(db, owner, `select adjust_stock($1, 10, 'Stok awal', 'adjustment', 400)`, [p])
    await asUser(db, owner, `select adjust_stock($1, 10, 'Tambah', 'adjustment', 600)`, [p])
    expect(Number((await product('NEW')).average_cost)).toBeCloseTo(500, 4)
  })
  it('opname menyamakan stok dengan hitungan fisik dan mencatat selisih', async () => {
    const before = (await product('KOPI')).stock
    const o = (await asUser<{ create_stock_opname: string }>(db, owner, `select create_stock_opname($1, $2::jsonb, 'Opname akhir bulan')`,
      [store, J([{ product_id: kopi, counted: before - 3 }, { product_id: gula, counted: (await product('GULA')).stock }])]))[0].create_stock_opname
    expect((await product('KOPI')).stock).toBe(before - 3)
    const items = await asUser<{ difference: number }>(db, owner, `select difference from stock_opname_items where opname_id = $1 order by difference`, [o])
    expect(items.map(i => i.difference)).toEqual([-3, 0])
    const mv = await asUser<{ quantity: number }>(db, owner, `select quantity from stock_movements where reference_id = $1`, [o])
    expect(mv).toEqual([{ quantity: -3 }]) // selisih nol tidak membuat pergerakan
  })
})

describe('pengeluaran', () => {
  it('tambah, ubah, dan batalkan dengan alasan; semuanya diaudit', async () => {
    const e = (await asUser<{ add_expense: string }>(db, owner, `select add_expense($1, current_date, 'Air', 'PDAM', 50000, 'cash', $2)`, [store, `${store}/bukti.png`]))[0].add_expense
    await asUser(db, owner, `select update_expense($1, current_date, 'Air', 'PDAM Oktober', 60000, 'transfer')`, [e])
    const r = await asUser<{ amount: string; payment_method: string; receipt_path: string }>(db, owner, `select amount, payment_method, receipt_path from expenses where id = $1`, [e])
    expect(r[0]).toMatchObject({ amount: 60000, payment_method: 'transfer', receipt_path: `${store}/bukti.png` })
    await expect(asUser(db, owner, `select void_expense($1, '')`, [e])).rejects.toThrow(/Alasan/)
    await asUser(db, owner, `select void_expense($1, 'salah input')`, [e])
    await expect(asUser(db, owner, `select update_expense($1, current_date, 'Air', 'x', 1, 'cash')`, [e])).rejects.toThrow(/dibatalkan/)
    const log = await asUser<{ action: string }>(db, owner, `select action from audit_logs where record_id = $1 order by created_at`, [e])
    expect(log.map(l => l.action)).toEqual(['add_expense', 'update_expense', 'void_expense'])
  })
  it('nominal dan metode divalidasi, kategori bawaan tersedia', async () => {
    await expect(asUser(db, owner, `select add_expense($1, current_date, 'Air', null, 0, 'cash')`, [store])).rejects.toThrow(/Nominal/)
    await expect(asUser(db, owner, `select add_expense($1, current_date, 'Air', null, 10, 'koin')`, [store])).rejects.toThrow(/Metode/)
    expect((await asUser(db, owner, `select id from expense_categories`)).length).toBe(10)
  })
})

describe('laporan keuangan', () => {
  it('laba dihitung dari HPP snapshot dengan retur dan pengeluaran', async () => {
    const r = await report()
    // Konsistensi akuntansi: laba kotor = penjualan bersih - HPP; laba bersih = laba kotor - pengeluaran aktif
    expect(r.net_sales).toBe(r.gross_sales - r.refunds)
    expect(r.gross_profit).toBe(r.net_sales - r.cogs)
    expect(r.net_profit).toBe(r.gross_profit - r.expenses)
    expect(r.expenses).toBe(0) // satu-satunya pengeluaran sudah dibatalkan
    expect(r.refunds).toBe(18000)
    expect(r.cogs).toBeGreaterThan(0)
    expect(r.avg_transaction).toBe(Math.round(r.gross_sales / r.transactions))
  })
  it('arus kas memakai pembayaran utang sebenarnya, bukan nilai pembelian', async () => {
    const r = await report()
    expect(r.purchases_paid).toBe(36000 + 11000)
    expect(r.cash_out).toBe(r.refunds + r.expenses + r.purchases_paid)
  })
  it('transaksi pending dihitung terpisah dan tidak masuk penjualan', async () => {
    const g0 = (await report()).gross_sales
    await sale(cashier, [{ product_id: kopi, quantity: 1 }], 'transfer', null)
    const r = await report()
    expect(r.gross_sales).toBe(g0)
    expect(r.pending_count).toBe(1)
    expect(r.pending_amount).toBe(2000)
  })
  it('get_sales_breakdown berjalan (bug "stable + temp table" sudah diperbaiki) dan mengeluarkan retur', async () => {
    const r = (await asUser<{ b: { products: { name: string; qty: number; revenue: number }[]; categories: unknown[] } }>(db, owner,
      `select get_sales_breakdown($1, '2000-01-01', '2100-01-01') b`, [store]))[0].b
    expect(r.products.length).toBeGreaterThan(0)
    const gulaRow = r.products.find(p => p.name === 'Gula')!
    expect(gulaRow.qty).toBe(0) // seluruh penjualan gula sudah diretur
    expect(gulaRow.revenue).toBe(0)
    expect(r.categories.length).toBeGreaterThan(0)
  })
  it('filter laporan: metode, produk, kategori, status', async () => {
    const onlyQris = (await asUser<{ b: { products: unknown[] } }>(db, owner, `select get_sales_breakdown($1, '2000-01-01', '2100-01-01', 'qris') b`, [store]))[0].b
    expect(onlyQris.products).toHaveLength(0)
    const pend = (await asUser<{ r: { total: number; rows: { payment_status: string }[] } }>(db, owner,
      `select get_sales_report($1, '2000-01-01', '2100-01-01', null, 'pending') r`, [store]))[0].r
    expect(pend.total).toBe(1)
    expect(pend.rows[0].payment_status).toBe('pending')
    const byProduct = (await asUser<{ r: { total: number } }>(db, owner, `select get_sales_report($1, '2000-01-01', '2100-01-01', null, null, null, $2) r`, [store, gula]))[0].r
    expect(byProduct.total).toBe(1)
    const paged = (await asUser<{ r: { total: number; rows: unknown[] } }>(db, owner, `select get_sales_report($1, '2000-01-01', '2100-01-01', null, null, null, null, 3, 0) r`, [store]))[0].r
    expect(paged.rows).toHaveLength(3)
    expect(paged.total).toBeGreaterThan(3)
  })
  it('laporan pembelian: per supplier, per produk, dan daftar dengan status penerimaan', async () => {
    const r = (await asUser<{ r: { by_supplier: { unpaid: number }[]; by_product: unknown[]; list: { receiving_status: string }[] } }>(db, owner,
      `select get_purchase_report($1, '2000-01-01', '2100-01-01') r`, [store]))[0].r
    expect(r.by_supplier[0].unpaid).toBe(0)
    expect(r.by_product.length).toBeGreaterThan(0)
    expect(new Set(r.list.map(x => x.receiving_status))).toEqual(new Set(['received', 'cancelled', 'draft']))
    const onlyDraft = (await asUser<{ r: { list: unknown[] } }>(db, owner, `select get_purchase_report($1, '2000-01-01', '2100-01-01', null, null, 'draft') r`, [store]))[0].r
    expect(onlyDraft.list).toHaveLength(1)
  })
  it('dashboard memuat kartu bulan ini, 12 bulan tren, dan daftar ringkas', async () => {
    const d = (await asUser<{ d: { month: Record<string, number>; series: { month: string }[]; recent_sales: unknown[]; top_products: unknown[]; lowest_stock: unknown[]; recent_purchases: unknown[]; active_products: number } }>(
      db, owner, `select get_dashboard($1) d`, [store]))[0].d
    expect(d.series).toHaveLength(12)
    expect(d.month.sales).toBeGreaterThan(0)
    expect(d.recent_sales.length).toBeGreaterThan(0)
    expect(d.top_products.length).toBeGreaterThan(0)
    expect(d.lowest_stock.length).toBeGreaterThan(0)
    expect(d.recent_purchases.length).toBeGreaterThan(0)
    expect(d.active_products).toBe(3)
    const monthNow = d.series[11]
    expect(monthNow).toBeDefined()
  })
  it('ringkasan kasir tidak memuat data laba', async () => {
    const c = (await asUser<{ c: Record<string, number> }>(db, cashier, `select get_cashier_summary($1) c`, [store]))[0].c
    expect(Object.keys(c).sort()).toEqual(['pending', 'sales', 'transactions'])
  })
  it('stok menipis dan filter status stok pada view produk', async () => {
    await asUser(db, owner, `select adjust_stock($1, -($2 - 1), 'turunkan', 'adjustment')`, [kopi, (await product('KOPI')).stock])
    const low = (await asUser<{ l: { count: number; items: { name: string }[] } }>(db, owner, `select get_low_stock($1) l`, [store]))[0].l
    expect(low.items.map(i => i.name)).toContain('Kopi')
    const v = await asUser<{ stock_status: string }>(db, owner, `select stock_status from products_owner where product_code = 'KOPI'`)
    expect(v[0].stock_status).toBe('low')
  })
})

describe('struk', () => {
  it('struk memuat uang diterima, kembalian, footer, dan tidak memuat harga modal', async () => {
    const s = await sale(cashier, [{ product_id: kopi, quantity: 1 }], 'cash', 5000)
    const r = (await asUser<{ r: Record<string, unknown> & { items: Record<string, unknown>[] } }>(db, cashier, `select get_receipt($1) r`, [s]))[0].r
    expect(r).toMatchObject({ received: 5000, change: 3000, total: 2000, footer: 'Terima kasih sudah berbelanja' })
    expect(JSON.stringify(r)).not.toMatch(/cost|modal/i)
    expect(r.items[0]).toHaveProperty('returned', 0)
  })
})
