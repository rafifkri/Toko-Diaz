// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Klien asli ke PostgREST, tetapi sesi login dipalsukan agar AuthContext menganggap pengguna sudah masuk.
let sessionUser: { id: string; email: string } | null = null
vi.mock('../../src/lib/supabase', async () => {
  const { supabase: real } = await import('./mockClient')
  const auth = {
    getSession: () => Promise.resolve({ data: { session: sessionUser ? { user: sessionUser, access_token: 'x' } : null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }), signOut: () => Promise.resolve({ error: null }),
  }
  return { supabase: new Proxy(real, { get: (t, k) => (k === 'auth' ? auth : Reflect.get(t, k)) }) }
})

import { as, newUser } from './harness'
import App from '../../src/App'
import { AuthProvider } from '../../src/contexts/AuthContext'
import { ToastProvider } from '../../src/contexts/ToastContext'
import { DialogProvider } from '../../src/contexts/DialogContext'
import { createStore } from '../../src/services/auth'
import { createCategory, createSupplier, listCategories, listSuppliers } from '../../src/services/master'
import { createProduct, listProducts } from '../../src/services/products'
import { createPurchase, receivePurchase, listPurchases } from '../../src/services/purchases'
import { createSale } from '../../src/services/sales'
import { saveExpense } from '../../src/services/expenses'
import { sql } from './harness'

// jsdom tidak punya API ini; browser sungguhan punya
class RO { observe() { /* kosong */ } unobserve() { /* kosong */ } disconnect() { /* kosong */ } }
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = RO
Element.prototype.scrollIntoView = () => undefined

const run = process.env.REST_URL ? describe : describe.skip
let owner = '', cashier = '', storeId = '', productId = '', supplierId = '', purchaseId = ''
const ids = { owner: { id: '', email: '' }, cashier: { id: '', email: '' } }

const mount = (path: string, who: 'owner' | 'cashier') => {
  sessionUser = ids[who]; as(ids[who].id)
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })}>
      <MemoryRouter initialEntries={[path]}><ToastProvider><DialogProvider><AuthProvider><App /></AuthProvider></DialogProvider></ToastProvider></MemoryRouter>
    </QueryClientProvider>)
}
afterEach(cleanup)
const noCrash = () => {
  expect(screen.queryByText('Terjadi kesalahan pada tampilan')).toBeNull()
  expect(screen.queryByText('Data gagal dimuat.')).toBeNull()
  expect(screen.queryByText(/tidak ditemukan\.$/)).toBeNull()
}

beforeAll(async () => {
  const tag = Date.now().toString(36)
  owner = newUser(`po-${tag}@toko.id`, 'Pemilik'); cashier = newUser(`pk-${tag}@toko.id`, 'Kasir Uji')
  ids.owner = { id: owner, email: `po-${tag}@toko.id` }; ids.cashier = { id: cashier, email: `pk-${tag}@toko.id` }
  as(owner); storeId = await createStore('Toko Halaman')
  sql(`insert into store_users (store_id, user_id, role) values ('${storeId}', '${cashier}', 'cashier')`)
  await createCategory(storeId, { category_name: 'Minuman', description: '' }); const cat = (await listCategories(storeId))[0].id
  await createSupplier(storeId, { supplier_name: 'Supplier Uji', phone: '', contact_person: '', address: '', notes: '' }); supplierId = (await listSuppliers(storeId, '', 1, 5)).rows[0].id
  productId = await createProduct(storeId, { product_code: 'KP1', product_name: 'Kopi Hitam', unit: 'pcs', selling_price: 3000, minimum_stock: 2, barcode: '', category_id: cat, initial_stock: 20, initial_cost: 1500 })
  purchaseId = await createPurchase(storeId, { supplier_id: supplierId, purchase_date: '2026-11-20', payment_method: 'cash', pay_on_receive: false, discount: 0, notes: '', due_date: '', lines: [{ product_id: productId, quantity: 5, unit_cost: 1600 }] })
  await receivePurchase(purchaseId)
  await createSale({ storeId, items: [{ product_id: productId, quantity: 2 }], discount: 0, method: 'cash', received: 10000 })
  as(cashier); await createSale({ storeId, items: [{ product_id: productId, quantity: 1 }], discount: 0, method: 'transfer' }); as(owner)
  await saveExpense(storeId, null, { expense_date: '2026-11-20', category: 'Air', description: 'PDAM', amount: 40000, payment_method: 'cash' })
}, 60_000)

run('setiap halaman owner tampil tanpa error dengan data nyata', () => {
  const pages: [string, RegExp][] = [
    ['/', /Dashboard/], ['/pos', /Keranjang/], ['/sales', /Riwayat Penjualan/], ['/profile', /Profil saya/], ['/products', /Kopi Hitam/], ['/categories', /Minuman/],
    ['/suppliers', /Supplier Uji/], ['/purchases', /Pembelian Barang/], ['/purchases/new', /Pembelian baru/], ['/inventory', /Manajemen Stok/], ['/expenses', /PDAM/],
    ['/reports', /Laporan/], ['/users', /Kasir Uji/], ['/audit', /Log Aktivitas/], ['/settings', /Pengaturan/],
  ]
  for (const [path, expected] of pages) {
    it(`owner membuka ${path}`, async () => {
      mount(path, 'owner')
      await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0), { timeout: 8000 })
      await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeNull(), { timeout: 8000 })
      noCrash()
    })
  }
  it('halaman detail: produk, supplier, pembelian, edit draft', async () => {
    as(owner); const first = (await listProducts(storeId, { search: '', categoryId: '', stock: '', active: '', page: 1, size: 5 })).rows[0]
    mount(`/products/${first.id}`, 'owner'); await screen.findByText('Riwayat stok', {}, { timeout: 8000 }); noCrash(); cleanup()
    mount(`/suppliers/${supplierId}`, 'owner'); await screen.findByText('Riwayat transaksi', {}, { timeout: 8000 }); noCrash(); cleanup()
    const pid = (await listPurchases(storeId, { receiving: '', payment: '', supplierId: '', page: 1, size: 5 })).rows[0].id
    mount(`/purchases/${pid}`, 'owner'); await screen.findByText('Riwayat pembayaran', {}, { timeout: 8000 }); expect(screen.getAllByText(/Kopi Hitam/).length).toBeGreaterThan(0); noCrash(); cleanup()
  })
  it('semua tab laporan, stok dan pengaturan dapat dibuka', async () => {
    mount('/reports', 'owner')
    for (const tab of ['Transaksi', 'Per produk / kategori', 'Pembelian', 'Ringkasan']) {
      fireEvent.click(await screen.findByRole('tab', { name: tab })); await waitFor(() => expect(document.querySelector('.animate-pulse')).toBeNull(), { timeout: 8000 }); noCrash()
    }
    cleanup(); mount('/inventory', 'owner')
    for (const tab of ['Stok opname', 'Riwayat', 'Penyesuaian']) { fireEvent.click(await screen.findByRole('tab', { name: tab })); await new Promise(r => setTimeout(r, 300)); noCrash() }
    cleanup(); mount('/settings', 'owner')
    for (const tab of ['Pembayaran', 'Struk', 'Stok', 'Profil toko']) { fireEvent.click(await screen.findByRole('tab', { name: tab })); await new Promise(r => setTimeout(r, 300)); noCrash() }
  })
})

run('alur pengguna', () => {
  it('owner mengubah produk lewat form (regresi: kode produk readonly tidak boleh memblokir simpan)', async () => {
    mount('/products', 'owner')
    fireEvent.click(await screen.findByRole('button', { name: 'Ubah' }))
    const dialog = await screen.findByRole('dialog')
    const code = within(dialog).getByDisplayValue('KP1') as HTMLInputElement; expect(code.readOnly).toBe(true)
    fireEvent.change(within(dialog).getByDisplayValue('Kopi Hitam'), { target: { value: 'Kopi Hitam Spesial' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan' }))
    await screen.findByText('Produk diperbarui.', {}, { timeout: 8000 })
    expect((await listProducts(storeId, { search: 'Spesial', categoryId: '', stock: '', active: '', page: 1, size: 5 })).total).toBe(1)
  })
  it('owner menambah produk baru dengan stok awal', async () => {
    mount('/products', 'owner'); fireEvent.click(await screen.findByRole('button', { name: /Tambah produk/ }))
    const d = await screen.findByRole('dialog')
    const [code, name] = within(d).getAllByRole('textbox') as HTMLInputElement[]
    fireEvent.change(code, { target: { value: 'TH1' } }); fireEvent.change(name, { target: { value: 'Teh Botol' } })
    fireEvent.click(within(d).getByRole('button', { name: 'Simpan' })); await screen.findByText('Produk ditambahkan.', {}, { timeout: 8000 })
  })
  it('kasir: pilih produk, bayar tunai, struk dan kembalian tampil, stok berkurang', async () => {
    mount('/pos', 'cashier')
    fireEvent.click(await screen.findByText('Kopi Hitam Spesial', {}, { timeout: 8000 }))
    const received = await screen.findByPlaceholderText('Uang diterima'); fireEvent.change(received, { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: /^Bayar/ }))
    await screen.findByText(/Lunas\. Kembalian/, {}, { timeout: 8000 })
    as(owner) // 20 awal + 5 pembelian - 2 (owner) - 1 (kasir tunai); transaksi pending belum mengurangi stok
    expect((await listProducts(storeId, { search: 'Spesial', categoryId: '', stock: '', active: '', page: 1, size: 5 })).rows[0].stock).toBe(22)
  })
  it('kasir: transaksi pending dapat dilanjutkan dari Riwayat lalu dikonfirmasi', async () => {
    mount('/sales?status=pending', 'cashier')
    fireEvent.click(await screen.findByRole('button', { name: 'Lanjutkan pembayaran' }, { timeout: 8000 }))
    await screen.findByText(/Menunggu pembayaran/); fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi pembayaran' }))
    await screen.findByText('Pembayaran dikonfirmasi.', {}, { timeout: 8000 })
  })
  it('owner: bayar utang supplier dari halaman detail pembelian', async () => {
    as(owner); const pid = (await listPurchases(storeId, { receiving: 'received', payment: '', supplierId: '', page: 1, size: 5 })).rows[0].id
    mount(`/purchases/${pid}`, 'owner'); fireEvent.click(await screen.findByRole('button', { name: /Bayar utang/ }, { timeout: 8000 }))
    const d = await screen.findByRole('dialog'); fireEvent.click(within(d).getByRole('button', { name: 'Catat pembayaran' }))
    await screen.findByText('Pembayaran dicatat.', {}, { timeout: 8000 })
  })
})
