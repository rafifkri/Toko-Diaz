import { beforeAll, describe, expect, it } from 'vitest'
import { asUser, createDb, newUser, type Db } from './harness'

/**
 * Uji keamanan: isolasi antar toko (RLS), pembatasan role, dan penguncian stok/HPP.
 * Database dibuat dari seluruh migrasi 0001 sampai 0010 di PGlite (Postgres sungguhan).
 */
let db: Db
let ownerA: string, ownerB: string, cashierA: string, cashierA2: string
let storeA: string, storeB: string, prodA: string

const id = async (sql: string, params: unknown[] = []) => (await db.query<{ id: string }>(sql, params)).rows[0].id

beforeAll(async () => {
  db = await createDb()
  ownerA = await newUser(db, 'a@toko.id', 'Owner A')
  ownerB = await newUser(db, 'b@toko.id', 'Owner B')
  cashierA = await newUser(db, 'k1@toko.id', 'Kasir 1')
  cashierA2 = await newUser(db, 'k2@toko.id', 'Kasir 2')
  storeA = (await asUser<{ create_store: string }>(db, ownerA, `select create_store('Toko A')`))[0].create_store
  storeB = (await asUser<{ create_store: string }>(db, ownerB, `select create_store('Toko B')`))[0].create_store
  await db.query(`insert into store_users (store_id, user_id, role) values ($1, $2, 'cashier'), ($1, $3, 'cashier')`, [storeA, cashierA, cashierA2])
  prodA = (await asUser<{ id: string }>(db, ownerA,
    `insert into products (store_id, product_code, product_name, selling_price, minimum_stock) values ($1, 'A1', 'Kopi A', 5000, 2) returning id`, [storeA]))[0].id
  await asUser(db, ownerB,
    `insert into products (store_id, product_code, product_name, selling_price) values ($1, 'B1', 'Teh B', 3000)`, [storeB])
  // stok awal lewat fungsi resmi
  await asUser(db, ownerA, `select adjust_stock($1, 20, 'Stok awal', 'adjustment', 2500)`, [prodA])
}, 120_000)

describe('isolasi antar toko', () => {
  it('owner toko B tidak melihat produk toko A', async () => {
    const rows = await asUser(db, ownerB, `select id from products where store_id = $1`, [storeA])
    expect(rows).toHaveLength(0)
  })
  it('owner hanya melihat tokonya sendiri', async () => {
    const rows = await asUser<{ id: string }>(db, ownerA, `select id from products`)
    expect(rows.map(r => r.id)).toEqual([prodA])
  })
  it('owner toko B tidak dapat membuka dashboard, laporan, atau struk toko A', async () => {
    await expect(asUser(db, ownerB, `select get_dashboard($1)`, [storeA])).rejects.toThrow(/Tidak diizinkan/)
    await expect(asUser(db, ownerB, `select get_financial_report($1, '2026-01-01', '2026-12-31')`, [storeA])).rejects.toThrow(/Tidak diizinkan/)
    await expect(asUser(db, ownerB, `select get_sales_breakdown($1, '2026-01-01', '2026-12-31')`, [storeA])).rejects.toThrow(/Tidak diizinkan/)
  })
  it('pengguna toko B tidak dapat menjual di toko A', async () => {
    await expect(asUser(db, ownerB, `select create_sale($1, $2::jsonb, 0, 'cash', null, 5000)`,
      [storeA, JSON.stringify([{ product_id: prodA, quantity: 1 }])])).rejects.toThrow(/Tidak diizinkan/)
  })
  it('pengguna toko B tidak dapat menyesuaikan stok produk toko A', async () => {
    await expect(asUser(db, ownerB, `select adjust_stock($1, 5, 'curang')`, [prodA])).rejects.toThrow(/Tidak diizinkan/)
  })
  it('anon tidak membaca apa pun', async () => {
    expect(await asUser(db, null, `select id from stores`)).toHaveLength(0)
    expect(await asUser(db, null, `select id from products`)).toHaveLength(0)
  })
  it('audit log hanya terlihat oleh owner tokonya', async () => {
    const a = await asUser(db, ownerA, `select id from audit_logs`)
    expect(a.length).toBeGreaterThan(0)
    expect(await asUser(db, cashierA, `select id from audit_logs`)).toHaveLength(0)
    const bRows = await asUser<{ store_id: string }>(db, ownerB, `select store_id from audit_logs`)
    expect(bRows.every(r => r.store_id === storeB)).toBe(true)
  })
})

describe('pembatasan role kasir', () => {
  it('kasir tidak membaca tabel products (harga modal), hanya view products_pos', async () => {
    expect(await asUser(db, cashierA, `select * from products`)).toHaveLength(0)
    const view = await asUser<Record<string, unknown>>(db, cashierA, `select * from products_pos`)
    expect(view).toHaveLength(1)
    expect(Object.keys(view[0])).not.toContain('average_cost')
    expect(Object.keys(view[0])).not.toContain('purchase_price')
  })
  it('kasir tidak dapat memakai fungsi owner', async () => {
    await expect(asUser(db, cashierA, `select adjust_stock($1, 1, 'x')`, [prodA])).rejects.toThrow(/Tidak diizinkan/)
    await expect(asUser(db, cashierA, `select get_dashboard($1)`, [storeA])).rejects.toThrow(/Tidak diizinkan/)
    await expect(asUser(db, cashierA, `select add_expense($1, current_date, 'Air', null, 1000, 'cash')`, [storeA])).rejects.toThrow(/Tidak diizinkan/)
  })
  it('kasir hanya melihat transaksinya sendiri', async () => {
    const s1 = (await asUser<{ create_sale: string }>(db, cashierA, `select create_sale($1, $2::jsonb, 0, 'cash', null, 5000)`,
      [storeA, JSON.stringify([{ product_id: prodA, quantity: 1 }])]))[0].create_sale
    const mine = await asUser<{ id: string }>(db, cashierA, `select id from sales`)
    expect(mine.map(r => r.id)).toEqual([s1])
    expect(await asUser(db, cashierA2, `select id from sales`)).toHaveLength(0)
    expect((await asUser(db, ownerA, `select id from sales where id = $1`, [s1]))).toHaveLength(1)
  })
  it('kasir lain tidak dapat melihat struk maupun mengonfirmasi transaksi orang lain', async () => {
    const pend = (await asUser<{ create_sale: string }>(db, cashierA, `select create_sale($1, $2::jsonb, 0, 'transfer')`,
      [storeA, JSON.stringify([{ product_id: prodA, quantity: 1 }])]))[0].create_sale
    await expect(asUser(db, cashierA2, `select get_receipt($1)`, [pend])).rejects.toThrow(/Tidak diizinkan/)
    await expect(asUser(db, cashierA2, `select confirm_payment($1)`, [pend])).rejects.toThrow(/Tidak diizinkan/)
    await expect(asUser(db, cashierA2, `select cancel_pending_sale($1)`, [pend])).rejects.toThrow(/Tidak diizinkan/)
    await asUser(db, cashierA, `select cancel_pending_sale($1)`, [pend]) // pemilik transaksi boleh
  })
  it('kasir tidak dapat refund', async () => {
    const s = (await asUser<{ id: string }>(db, cashierA, `select id from sales limit 1`))[0].id
    await expect(asUser(db, cashierA, `select refund_sale($1, 'iseng', true)`, [s])).rejects.toThrow(/Tidak diizinkan/)
  })
})

describe('stok dan HPP tidak dapat diubah lewat API', () => {
  it('owner tidak dapat mengubah stock langsung', async () => {
    await expect(asUser(db, ownerA, `update products set stock = 9999 where id = $1`, [prodA])).rejects.toThrow(/permission denied/i)
  })
  it('owner tidak dapat mengubah average_cost atau purchase_price langsung', async () => {
    await expect(asUser(db, ownerA, `update products set average_cost = 1 where id = $1`, [prodA])).rejects.toThrow(/permission denied/i)
    await expect(asUser(db, ownerA, `update products set purchase_price = 1 where id = $1`, [prodA])).rejects.toThrow(/permission denied/i)
  })
  it('owner tidak dapat membuat produk dengan stok awal langsung', async () => {
    await expect(asUser(db, ownerA, `insert into products (store_id, product_code, product_name, stock) values ($1, 'Z', 'Z', 50)`, [storeA]))
      .rejects.toThrow(/permission denied/i)
  })
  it('perubahan harga jual dan nama tetap diizinkan dan tercatat di audit log', async () => {
    await asUser(db, ownerA, `update products set selling_price = 5500, updated_at = now() where id = $1`, [prodA])
    const log = await asUser<{ action: string; old_data: { selling_price: number }; new_data: { selling_price: number } }>(
      db, ownerA, `select action, old_data, new_data from audit_logs where record_id = $1 and action = 'update_products'`, [prodA])
    expect(log).toHaveLength(1)
    expect(log[0].old_data.selling_price).toBe(5000)
    expect(log[0].new_data.selling_price).toBe(5500)
    await asUser(db, ownerA, `update products set selling_price = 5000 where id = $1`, [prodA])
  })
  it('perubahan stok oleh penjualan tidak membanjiri audit log produk', async () => {
    const before = (await db.query<{ c: number }>(`select count(*)::int c from audit_logs where action = 'update_products'`)).rows[0].c
    await asUser(db, ownerA, `select create_sale($1, $2::jsonb, 0, 'cash', null, 5000)`, [storeA, JSON.stringify([{ product_id: prodA, quantity: 1 }])])
    const after = (await db.query<{ c: number }>(`select count(*)::int c from audit_logs where action = 'update_products'`)).rows[0].c
    expect(after).toBe(before)
  })
})

describe('tabel transaksi tertutup untuk tulis langsung', () => {
  it('purchases, expenses, sales, stock_movements tidak dapat ditulis langsung oleh owner', async () => {
    await expect(asUser(db, ownerA, `insert into expenses (store_id, expense_number, category, amount) values ($1, 'X', 'Air', 1)`, [storeA])).rejects.toThrow(/permission denied/i)
    await expect(asUser(db, ownerA, `update sales set total_amount = 1`)).rejects.toThrow(/permission denied/i)
    await expect(asUser(db, ownerA, `delete from stock_movements`)).rejects.toThrow(/permission denied/i)
    await expect(asUser(db, ownerA, `insert into audit_logs (store_id, action) values ($1, 'palsu')`, [storeA])).rejects.toThrow(/permission denied/i)
  })
  it('owner tidak dapat membalik status pembelian tanpa menambah stok', async () => {
    const pid = (await asUser<{ create_purchase: string }>(db, ownerA,
      `select create_purchase($1, null, $2::jsonb, 0, false)`, [storeA, JSON.stringify([{ product_id: prodA, quantity: 5, unit_cost: 2000 }])]))[0].create_purchase
    await expect(asUser(db, ownerA, `update purchases set receiving_status = 'received' where id = $1`, [pid])).rejects.toThrow(/permission denied/i)
  })
  it('keanggotaan dan kepemilikan toko tidak dapat diubah langsung', async () => {
    await expect(asUser(db, ownerA, `update store_users set role = 'owner' where user_id = $1`, [cashierA])).rejects.toThrow(/permission denied/i)
    await expect(asUser(db, ownerA, `update stores set owner_id = $2 where id = $1`, [storeA, cashierA])).rejects.toThrow(/permission denied/i)
  })
  it('perubahan role dan status anggota lewat fungsi, tercatat, dan tidak berlaku untuk diri sendiri', async () => {
    const member = await id(`select id from store_users where user_id = $1`, [cashierA2])
    await asUser(db, ownerA, `select set_member_active($1, false)`, [member])
    expect((await asUser<{ is_active: boolean }>(db, ownerA, `select is_active from store_users where id = $1`, [member]))[0].is_active).toBe(false)
    await asUser(db, ownerA, `select set_member_active($1, true)`, [member])
    const self = await id(`select id from store_users where user_id = $1`, [ownerA])
    await expect(asUser(db, ownerA, `select set_member_role($1, 'cashier')`, [self])).rejects.toThrow(/sendiri/)
    await expect(asUser(db, cashierA, `select set_member_active($1, false)`, [member])).rejects.toThrow(/Tidak diizinkan/)
    const log = await asUser(db, ownerA, `select id from audit_logs where table_name = 'store_users' and action = 'update_store_users'`)
    expect(log.length).toBeGreaterThanOrEqual(2)
  })
  it('owner toko lain tidak dapat mengubah anggota toko A', async () => {
    const member = await id(`select id from store_users where user_id = $1`, [cashierA])
    await expect(asUser(db, ownerB, `select set_member_active($1, false)`, [member])).rejects.toThrow(/Tidak diizinkan/)
  })
  it('pengguna hanya mengubah nama dan telepon profilnya sendiri', async () => {
    await asUser(db, cashierA, `update profiles set full_name = 'Kasir Satu' where id = $1`, [cashierA])
    await expect(asUser(db, cashierA, `update profiles set email = 'x@x.id' where id = $1`, [cashierA])).rejects.toThrow(/permission denied/i)
    const other = await asUser(db, cashierA, `update profiles set full_name = 'Hack' where id = $1 returning id`, [ownerA])
    expect(other).toHaveLength(0)
  })
})

describe('pengaturan toko', () => {
  it('kasir dapat membaca tetapi tidak menulis pengaturan', async () => {
    expect(await asUser(db, cashierA, `select * from store_settings`)).toHaveLength(1)
    await expect(asUser(db, cashierA, `update store_settings set receipt_footer = 'x'`)).resolves.toEqual([])
    const f = await asUser<{ receipt_footer: string }>(db, ownerA, `select receipt_footer from store_settings`)
    expect(f[0].receipt_footer).not.toBe('x')
  })
  it('perubahan QRIS/pembayaran dicatat di audit log', async () => {
    await asUser(db, ownerA, `update store_payment_settings set qris_path = $2, is_active = true where store_id = $1 and payment_method = 'qris'`, [storeA, `${storeA}/qris.png`])
    const log = await asUser(db, ownerA, `select id from audit_logs where table_name = 'store_payment_settings'`)
    expect(log.length).toBeGreaterThan(0)
  })
})

describe('Storage: file dipisah per toko dan per role', () => {
  it('owner dapat mengunggah ke folder tokonya, bukan ke folder toko lain', async () => {
    await asUser(db, ownerA, `insert into storage.objects (bucket_id, name) values ('expense-receipts', $1)`, [`${storeA}/bukti.png`])
    await asUser(db, ownerA, `insert into storage.objects (bucket_id, name) values ('product-images', $1)`, [`${storeA}/p.png`])
    await expect(asUser(db, ownerB, `insert into storage.objects (bucket_id, name) values ('expense-receipts', $1)`, [`${storeA}/curang.png`])).rejects.toThrow(/row-level security/i)
  })
  it('toko lain tidak dapat membaca file toko A', async () => {
    expect(await asUser(db, ownerB, `select name from storage.objects where bucket_id = 'expense-receipts'`)).toHaveLength(0)
  })
  it('kasir membaca foto produk tetapi tidak bukti pengeluaran', async () => {
    expect(await asUser(db, cashierA, `select name from storage.objects where bucket_id = 'product-images'`)).toHaveLength(1)
    expect(await asUser(db, cashierA, `select name from storage.objects where bucket_id = 'expense-receipts'`)).toHaveLength(0)
    await expect(asUser(db, cashierA, `insert into storage.objects (bucket_id, name) values ('product-images', $1)`, [`${storeA}/kasir.png`])).rejects.toThrow(/row-level security/i)
  })
})

describe('seed.sql', () => {
  it('berjalan pada skema terbaru dan dapat diulang tanpa duplikasi', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const seed = readFileSync(join(__dirname, '..', '..', 'supabase', 'seed.sql'), 'utf8')
    await db.exec(seed); await db.exec(seed)
    const rows = await db.query<{ c: number }>(`select count(*)::int c from suppliers where supplier_name = 'Supplier Contoh'`)
    expect(rows.rows[0].c).toBe(1)
  })
})

describe('create_store idempoten', () => {
  it('akun yang sudah punya toko aktif menerima toko yang sama dan tidak membuat toko baru', async () => {
    const again = (await asUser<{ create_store: string }>(db, ownerA, `select create_store('Nama Lain')`))[0].create_store
    expect(again).toBe(storeA)
    const n = await db.query<{ c: number }>(`select count(*)::int as c from stores where owner_id = $1`, [ownerA])
    expect(n.rows[0].c).toBe(1)
  })
  it('keanggotaan nonaktif ditolak dengan pesan yang jelas', async () => {
    await db.query(`update store_users set is_active = false where user_id = $1`, [cashierA2])
    await expect(asUser(db, cashierA2, `select create_store('Toko Baru')`)).rejects.toThrow(/dinonaktifkan/)
    await db.query(`update store_users set is_active = true where user_id = $1`, [cashierA2])
  })
})
