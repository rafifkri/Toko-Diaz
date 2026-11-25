import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/supabase', () => import('./mockClient'))

import { as, newUser, sql } from './harness'
import { createStore, getMyProfile, loadMemberships, updateMyProfile } from '../../src/services/auth'
import { createProduct, getProduct, listAllProducts, listMovements, listPosProducts, listProductOptions, listProducts, setProductActive, updateProduct, importProducts } from '../../src/services/products'
import { createCategory, createSupplier, deleteCategory, getSupplier, listActiveSuppliers, listCategories, listSuppliers, setSupplierActive, updateCategory, updateSupplier } from '../../src/services/master'
import { cancelPurchase, createPurchase, getPurchase, listPurchases, listSupplierPurchases, payPurchase, receivePurchase, updatePurchaseDraft } from '../../src/services/purchases'
import { cancelPending, confirmPayment, createSale, failPending, getReceipt, getSale, listPendingSales, listReturns, listSales, refundSale } from '../../src/services/sales'
import { adjustStock, createOpname, getOpnameItems, listAllMovements, listOpnames } from '../../src/services/inventory'
import { addExpenseCategory, listExpenseCategories, listExpenses, renameExpenseCategory, saveExpense, setExpenseCategoryActive, voidExpense } from '../../src/services/expenses'
import { getFinancialReport, getPurchaseReport, getSalesBreakdown, getSalesReport } from '../../src/services/reports'
import { getCashierSummary, getDashboard, getLowStock } from '../../src/services/dashboard'
import { listMembers, setMemberActive, setMemberRole } from '../../src/services/users'
import { getStoreProfile, getStoreSettings, listPaymentSettings, saveStoreSettings, savePaymentSetting, updateStoreProfile } from '../../src/services/settings'
import { listAuditLogs } from '../../src/services/audit'
import type { ProductForm } from '../../src/schemas'

/** Menguji kode services/ asli terhadap PostgREST + Postgres sungguhan (kontrak REST, embed, filter, upsert, hak kolom). */
const run = process.env.REST_URL ? describe : describe.skip
const form = (o: Partial<ProductForm> = {}): ProductForm => ({ product_code: 'K1', product_name: 'Kopi', unit: 'pcs', selling_price: 2000, minimum_stock: 3, barcode: '', category_id: '', initial_stock: 0, initial_cost: 0, ...o })

let owner = '', cashier = '', storeId = '', catId = '', supId = '', kopi = '', gula = ''
const rows = { page: 1, size: 20 }

beforeAll(() => {
  const tag = Date.now().toString(36)
  owner = newUser(`owner-${tag}@toko.id`, 'Owner'); cashier = newUser(`kasir-${tag}@toko.id`, 'Kasir')
})

run('auth dan toko', () => {
  it('create_store idempoten: panggilan kedua mengembalikan toko yang sama', async () => {
    as(owner); storeId = await createStore('Toko Diaz'); expect(storeId).toMatch(/^[0-9a-f-]{36}$/)
    expect(await createStore('Nama Lain')).toBe(storeId)
    sql(`insert into store_users (store_id, user_id, role) values ('${storeId}', '${cashier}', 'cashier')`)
  })
  it('loadMemberships (embed stores) dan profil', async () => {
    as(owner); const m = await loadMemberships(owner)
    expect(m).toEqual([expect.objectContaining({ store_id: storeId, role: 'owner', store_name: 'Toko Diaz' })])
    expect((await getMyProfile(owner)).email).toMatch(/^owner-.*@toko\.id$/)
    await updateMyProfile(owner, { full_name: 'Owner Baru', phone: '0812' }); expect((await getMyProfile(owner)).full_name).toBe('Owner Baru')
  })
})

run('master data', () => {
  it('kategori: tambah, ubah, hapus', async () => {
    as(owner); await createCategory(storeId, { category_name: 'Minuman', description: '' }); const c = (await listCategories(storeId))[0]; catId = c.id
    await updateCategory(c.id, { category_name: 'Minuman Panas', description: 'x' }); expect((await listCategories(storeId))[0].category_name).toBe('Minuman Panas')
    await createCategory(storeId, { category_name: 'Sementara', description: '' }); const t = (await listCategories(storeId)).find(x => x.category_name === 'Sementara')!
    await deleteCategory(t.id); expect(await listCategories(storeId)).toHaveLength(1)
  })
  it('supplier: tambah, cari, ubah, nonaktif, opsi aktif', async () => {
    as(owner); await createSupplier(storeId, { supplier_name: 'PT Kopi Nusantara', phone: '0811', contact_person: '', address: '', notes: '' })
    const p = await listSuppliers(storeId, 'nusa', 1, 10); expect(p.total).toBe(1); supId = p.rows[0].id
    await updateSupplier(supId, { supplier_name: 'PT Kopi Nusantara', phone: '0899', contact_person: 'Budi', address: 'Jl. A', notes: 'n' }); expect((await getSupplier(supId)).contact_person).toBe('Budi')
    expect(await listActiveSuppliers(storeId)).toHaveLength(1); await setSupplierActive(supId, false); expect(await listActiveSuppliers(storeId)).toHaveLength(0); await setSupplierActive(supId, true)
  })
})

run('produk', () => {
  it('createProduct dengan stok awal + HPP; stok tidak dapat diisi langsung', async () => {
    as(owner)
    kopi = await createProduct(storeId, form({ category_id: catId, barcode: '899001', initial_stock: 10, initial_cost: 1000 }))
    gula = await createProduct(storeId, form({ product_code: 'G1', product_name: 'Gula', selling_price: 5000 }))
    const p = await getProduct(kopi); expect(p).toMatchObject({ stock: 10, category_name: 'Minuman Panas', stock_status: 'ok' }); expect(Number(p.average_cost)).toBe(1000)
  })
  it('listProducts: pencarian (nama/kode/barcode), filter kategori/stok/aktif, paginasi, total', async () => {
    as(owner); const f = { search: '', categoryId: '', stock: '' as const, active: '' as const, ...rows }
    expect((await listProducts(storeId, f)).total).toBe(2)
    expect((await listProducts(storeId, { ...f, search: 'kop' })).rows.map(r => r.product_code)).toEqual(['K1'])
    expect((await listProducts(storeId, { ...f, search: '899001' })).total).toBe(1)
    expect((await listProducts(storeId, { ...f, search: "a,b)(%*'" })).total).toBe(0) // karakter berbahaya tidak merusak query
    expect((await listProducts(storeId, { ...f, categoryId: catId })).total).toBe(1)
    expect((await listProducts(storeId, { ...f, stock: 'out' })).rows.map(r => r.product_code)).toEqual(['G1'])
    expect((await listProducts(storeId, { ...f, size: 1 })).rows).toHaveLength(1)
    expect((await listAllProducts(storeId, { search: '', categoryId: '', stock: '', active: '' }))).toHaveLength(2)
  })
  it('updateProduct dan setProductActive; opsi produk; produk kasir (view)', async () => {
    as(owner); await updateProduct(storeId, kopi, form({ product_code: 'K1', selling_price: 2500, category_id: catId, barcode: '899001' }))
    expect((await getProduct(kopi)).selling_price).toBe(2500)
    await setProductActive(gula, false); expect((await listProductOptions(storeId)).map(p => p.product_code)).toEqual(['K1']); await setProductActive(gula, true)
    as(cashier); const pos = await listPosProducts(storeId); expect(pos).toHaveLength(2); expect(Object.keys(pos[0])).not.toContain('average_cost')
  })
  it('riwayat stok produk dan import (kode ganda dilewati)', async () => {
    as(owner); expect((await listMovements(kopi, 1, 10)).total).toBe(1)
    await importProducts(storeId, [{ product_code: 'K1', product_name: 'Duplikat', unit: 'pcs', barcode: null, selling_price: 1, minimum_stock: 0 }, { product_code: 'T1', product_name: 'Teh', unit: 'pcs', barcode: null, selling_price: 3000, minimum_stock: 1 }])
    const all = await listAllProducts(storeId, { search: '', categoryId: '', stock: '', active: '' }); expect(all.find(p => p.product_code === 'K1')?.product_name).toBe('Kopi'); expect(all).toHaveLength(3)
  })
})

run('pembelian dan utang', () => {
  let pid = ''
  it('buat, ubah draft, terima, bayar cicil; detail dengan embed', async () => {
    as(owner)
    pid = await createPurchase(storeId, { supplier_id: supId, purchase_date: '2026-11-20', payment_method: 'cash', pay_on_receive: false, discount: 0, notes: 'faktur 1', due_date: '', lines: [{ product_id: gula, quantity: 5, unit_cost: 3000 }] })
    await updatePurchaseDraft(pid, { supplier_id: supId, purchase_date: '2026-11-21', payment_method: 'transfer', pay_on_receive: false, discount: 1500, notes: 'faktur 1b', due_date: '2026-12-01', lines: [{ product_id: gula, quantity: 10, unit_cost: 3000 }] })
    let d = await getPurchase(pid); expect(d.purchase).toMatchObject({ total_amount: 28500, receiving_status: 'draft', payment_method: 'transfer', due_date: '2026-12-01', suppliers: { supplier_name: 'PT Kopi Nusantara' } })
    expect(d.items[0].products?.product_name).toBe('Gula')
    await receivePurchase(pid); await payPurchase(pid, 10000, 'cash', '2026-11-22', 'cicilan'); d = await getPurchase(pid)
    expect(d.purchase).toMatchObject({ payment_status: 'partial', paid_amount: 10000 }); expect(d.payments).toHaveLength(1)
    await payPurchase(pid, 18500, 'transfer', '2026-11-23'); expect((await getPurchase(pid)).purchase.payment_status).toBe('paid')
  })
  it('daftar dengan filter + riwayat supplier; batal draft', async () => {
    as(owner); const f = { receiving: '' as const, payment: '' as const, supplierId: '', ...rows }
    expect((await listPurchases(storeId, { ...f, receiving: 'received' })).total).toBe(1)
    expect((await listPurchases(storeId, { ...f, supplierId: supId, payment: 'paid' })).rows[0].suppliers?.supplier_name).toBe('PT Kopi Nusantara')
    expect(await listSupplierPurchases(supId)).toHaveLength(1)
    const d = await createPurchase(storeId, { supplier_id: '', purchase_date: '2026-11-24', payment_method: 'cash', pay_on_receive: true, discount: 0, notes: '', due_date: '', lines: [{ product_id: kopi, quantity: 1, unit_cost: 1 }] })
    await cancelPurchase(d); expect((await getPurchase(d)).purchase.receiving_status).toBe('cancelled')
  })
})

run('penjualan', () => {
  let cash = '', pend = ''
  it('kasir menjual tunai; struk, kembalian, riwayat sendiri', async () => {
    as(cashier); cash = await createSale({ storeId, items: [{ product_id: kopi, quantity: 2 }, { product_id: gula, quantity: 1 }], discount: 500, method: 'cash', received: 10000 })
    const s = await getSale(cash); expect(s).toMatchObject({ payment_status: 'paid', total_amount: 9500, change_amount: 500 })
    const r = await getReceipt(cash); expect(r).toMatchObject({ total: 9500, received: 10000, change: 500, footer: 'Terima kasih sudah berbelanja' }); expect(r.items).toHaveLength(2)
    expect((await listSales(storeId, { search: '', status: '', method: '', from: '', to: '', ...rows })).total).toBe(1)
    expect((await getCashierSummary(storeId)).sales).toBe(9500)
  })
  it('pending: daftar, lanjutkan lewat konfirmasi dengan referensi; gagal; batal', async () => {
    as(cashier); pend = await createSale({ storeId, items: [{ product_id: kopi, quantity: 1 }], discount: 0, method: 'transfer', reference: '' })
    expect((await listPendingSales(storeId)).map(s => s.id)).toContain(pend)
    await confirmPayment(pend, 'TRX-1'); expect((await getSale(pend)).payment_status).toBe('paid')
    const f = await createSale({ storeId, items: [{ product_id: kopi, quantity: 1 }], discount: 0, method: 'transfer' }); await failPending(f, 'tidak masuk'); expect((await getSale(f)).payment_status).toBe('failed')
    const c = await createSale({ storeId, items: [{ product_id: kopi, quantity: 1 }], discount: 0, method: 'transfer' }); await cancelPending(c); expect((await getSale(c)).payment_status).toBe('cancelled')
  })
  it('filter riwayat: status, metode, tanggal (zona Jakarta), pencarian invoice', async () => {
    as(owner); const f = { search: '', status: '' as const, method: '' as const, from: '', to: '', ...rows }
    expect((await listSales(storeId, { ...f, status: 'failed' })).total).toBe(1); expect((await listSales(storeId, { ...f, method: 'cash' })).total).toBe(1)
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()); expect((await listSales(storeId, { ...f, from: today, to: today })).total).toBeGreaterThanOrEqual(4)
    expect((await listSales(storeId, { ...f, from: '2000-01-01', to: '2000-01-02' })).total).toBe(0)
    const inv = (await getSale(cash)).invoice_number; expect((await listSales(storeId, { ...f, search: inv.slice(-8) })).total).toBe(1)
  })
  it('refund sebagian lalu sisanya; daftar retur (owner)', async () => {
    as(owner); const r = await getReceipt(cash); const item = r.items.find(i => i.name === 'Kopi')!
    await refundSale(cash, 'rusak', true, [{ sale_item_id: item.id, quantity: 1 }]); expect((await getSale(cash)).payment_status).toBe('paid')
    await refundSale(cash, 'sisa', false); expect((await getSale(cash))).toMatchObject({ payment_status: 'refunded', refunded_amount: 9500 })
    expect(await listReturns(cash)).toHaveLength(2)
  })
})

run('stok, opname, pengeluaran', () => {
  it('penyesuaian jenis keluar, riwayat dengan filter, opname dengan embed hitung item', async () => {
    as(owner); await adjustStock(kopi, -1, 'pecah', 'damage_out'); await adjustStock(kopi, 2, 'koreksi', 'adjustment', 1200)
    const m = await listAllMovements(storeId, { productId: kopi, type: 'damage_out', from: '', to: '', ...rows }); expect(m.total).toBe(1); expect(m.rows[0].products?.product_name).toBe('Kopi')
    const o = await createOpname(storeId, [{ product_id: kopi, counted: 5 }, { product_id: gula, counted: 3 }], 'akhir bulan')
    const list = await listOpnames(storeId, 1, 10); expect(list.rows[0].stock_opname_items).toHaveLength(2)
    expect((await getOpnameItems(o)).find(i => i.products?.product_name === 'Kopi')).toMatchObject({ counted_qty: 5 })
  })
  it('pengeluaran: kategori bawaan, tambah/ubah/batal, filter dan total', async () => {
    as(owner); expect((await listExpenseCategories(storeId)).length).toBeGreaterThanOrEqual(10)
    await addExpenseCategory(storeId, 'Parkir'); const c = (await listExpenseCategories(storeId)).find(x => x.category_name === 'Parkir')!
    await renameExpenseCategory(c.id, 'Parkir & Kebersihan'); await setExpenseCategoryActive(c.id, false)
    await saveExpense(storeId, null, { expense_date: '2026-11-20', category: 'Air', description: 'PDAM', amount: 50000, payment_method: 'cash' })
    const f = { from: '2026-11-01', to: '2026-11-30', category: 'Air', status: '' as const, ...rows }
    let e = await listExpenses(storeId, f); expect(e).toMatchObject({ total: 1, sum: 50000 })
    await saveExpense(storeId, e.rows[0].id, { expense_date: '2026-11-21', category: 'Air', description: 'PDAM Nov', amount: 60000, payment_method: 'transfer' })
    e = await listExpenses(storeId, f); expect(e.sum).toBe(60000); await voidExpense(e.rows[0].id, 'salah'); expect((await listExpenses(storeId, f)).sum).toBe(0)
  })
})

run('laporan, dashboard, notifikasi', () => {
  const r: [string, string] = ['2026-01-01', '2026-12-31']
  it('semua fungsi laporan menjawab dengan bentuk yang dipakai frontend', async () => {
    as(owner)
    const fin = await getFinancialReport(storeId, r); expect(fin.net_sales).toBe(fin.gross_sales - fin.refunds); expect(Array.isArray(fin.daily)).toBe(true)
    const b = await getSalesBreakdown(storeId, r, { method: '', categoryId: '', productId: '' }); expect(Array.isArray(b.products)).toBe(true)
    const s = await getSalesReport(storeId, r, { method: '', status: '', categoryId: '', productId: '' }, 1, 20); expect(s.total).toBeGreaterThan(0); expect(s.rows[0]).toHaveProperty('cashier')
    const p = await getPurchaseReport(storeId, r, { supplierId: '', productId: '', status: '' }); expect(p.list.length).toBeGreaterThan(0)
    const d = await getDashboard(storeId); expect(d.series).toHaveLength(12); expect(d).toHaveProperty('payables')
    const low = await getLowStock(storeId, 10); expect(low).toHaveProperty('count')
  })
})

run('pengguna, pengaturan, audit', () => {
  it('daftar anggota (embed profiles), nonaktif, ubah role', async () => {
    as(owner); const m = await listMembers(storeId); expect(m).toHaveLength(2); expect(m.find(x => x.role === 'cashier')?.profiles?.email).toMatch(/^kasir-/)
    const k = m.find(x => x.role === 'cashier')!; await setMemberActive(k.id, false); expect((await listMembers(storeId)).find(x => x.id === k.id)?.is_active).toBe(false)
    await setMemberActive(k.id, true); await setMemberRole(k.id, 'owner'); await setMemberRole(k.id, 'cashier')
  })
  it('profil toko, pengaturan struk/stok (upsert), pembayaran (upsert + rekening)', async () => {
    as(owner); await updateStoreProfile(storeId, { store_name: 'Toko Diaz Jaya', address: 'Jl. B', phone: '08', email: '' }); expect((await getStoreProfile(storeId)).store_name).toBe('Toko Diaz Jaya')
    await saveStoreSettings(storeId, { receipt_footer: 'Sampai jumpa', receipt_width: 80, auto_print_receipt: true }); expect(await getStoreSettings(storeId)).toMatchObject({ receipt_footer: 'Sampai jumpa', receipt_width: 80, default_unit: 'pcs' })
    await saveStoreSettings(storeId, { default_unit: 'bks', default_minimum_stock: 4 }); expect((await getStoreSettings(storeId)).default_unit).toBe('bks')
    await savePaymentSetting(storeId, 'transfer', { bank_name: 'BCA', bank_account_number: '123', bank_account_name: 'Diaz' })
    const t = (await listPaymentSettings(storeId)).find(p => p.payment_method === 'transfer'); expect(t).toMatchObject({ bank_name: 'BCA', is_active: true })
    as(cashier); expect((await listPaymentSettings(storeId)).length).toBe(3) // kasir perlu membaca rekening/QRIS
  })
  it('log aktivitas (embed profiles) dengan filter modul dan aksi', async () => {
    as(owner); const f = { action: '', table: '', from: '', to: '', ...rows }
    const all = await listAuditLogs(storeId, f); expect(all.total).toBeGreaterThan(10); expect(all.rows.some(l => l.profiles?.email?.startsWith('owner-'))).toBe(true)
    expect((await listAuditLogs(storeId, { ...f, table: 'sales' })).rows.every(l => l.table_name === 'sales')).toBe(true)
    expect((await listAuditLogs(storeId, { ...f, action: 'refund' })).total).toBeGreaterThan(0)
    as(cashier); expect((await listAuditLogs(storeId, f)).total).toBe(0)
  })
})
