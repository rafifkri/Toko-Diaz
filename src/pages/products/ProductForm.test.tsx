import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const svc = vi.hoisted(() => ({ updateProduct: vi.fn().mockResolvedValue(undefined), createProduct: vi.fn().mockResolvedValue('new-id') }))
vi.mock('../../services/products', () => svc)
vi.mock('../../contexts/AuthContext', () => ({ useStore: () => ({ storeId: 's1', isOwner: true }) }))
vi.mock('../../hooks/queries', () => ({ useCategories: () => ({ data: [] }), useStoreSettings: () => ({ data: { default_unit: 'bks', default_minimum_stock: 7 } }) }))

import ProductForm from './ProductForm'
import { ToastProvider } from '../../contexts/ToastContext'
import type { ProductRow } from '../../types'

afterEach(() => { cleanup(); vi.clearAllMocks() })
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>)
const product = { id: 'p1', store_id: 's1', category_id: null, product_code: 'KP1', barcode: null, product_name: 'Kopi', unit: 'pcs', purchase_price: 0, average_cost: 0,
  selling_price: 3000, stock: 5, minimum_stock: 2, image_url: null, is_active: true, created_at: '', updated_at: '', category_name: null, stock_status: 'ok' } as ProductRow

describe('ProductForm', () => {
  it('mengubah produk berhasil: kode readonly tetap lolos validasi dan ikut terkirim ke service (regresi)', async () => {
    wrap(<ProductForm product={product} onClose={() => undefined} />)
    const code = screen.getByDisplayValue('KP1') as HTMLInputElement
    expect(code.readOnly).toBe(true); expect(code.disabled).toBe(false)
    fireEvent.change(screen.getByDisplayValue('Kopi'), { target: { value: 'Kopi Baru' } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(svc.updateProduct).toHaveBeenCalled())
    expect(svc.updateProduct.mock.calls[0][1]).toBe('p1'); expect(svc.updateProduct.mock.calls[0][2]).toMatchObject({ product_name: 'Kopi Baru', product_code: 'KP1' })
  })
  it('produk baru memakai satuan dan stok minimum default dari pengaturan', async () => {
    wrap(<ProductForm product={null} onClose={() => undefined} />)
    await waitFor(() => expect((screen.getByPlaceholderText('pcs, kg, liter…') as HTMLInputElement).value).toBe('bks'))
  })
  it('validasi: nama kosong ditolak dan service tidak dipanggil', async () => {
    wrap(<ProductForm product={null} onClose={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText('Kode wajib diisi')).toBeTruthy(); expect(svc.createProduct).not.toHaveBeenCalled()
  })
})
