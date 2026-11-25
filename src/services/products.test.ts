import { describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({ update: [] as unknown[], insert: [] as unknown[] }))
vi.mock('../lib/supabase', () => {
  const b: Record<string, unknown> = {}
  b.update = (v: unknown) => { calls.update.push(v); return b }
  b.insert = (v: unknown) => { calls.insert.push(v); return b }
  for (const m of ['eq', 'select', 'single']) b[m] = () => b
  b.then = (res: (v: unknown) => void) => res({ data: { id: 'x' }, error: null })
  return { supabase: { from: () => b, rpc: () => Promise.resolve({ data: null, error: null }) } }
})
import { createProduct, updateProduct } from './products'
import type { ProductForm } from '../schemas'

const f: ProductForm = { product_code: 'KP1', product_name: 'Kopi', unit: 'pcs', selling_price: 1, minimum_stock: 0, barcode: '', category_id: '' }

describe('products service', () => {
  it('update tidak pernah mengirim product_code (kolom itu tidak boleh diubah di database)', async () => {
    await updateProduct('s1', 'p1', f); expect(calls.update[0]).not.toHaveProperty('product_code'); expect(calls.update[0]).toMatchObject({ product_name: 'Kopi' })
  })
  it('insert membawa product_code dan store_id, tanpa stok/HPP', async () => {
    await createProduct('s1', f); expect(calls.insert[0]).toMatchObject({ product_code: 'KP1', store_id: 's1' })
    for (const k of ['stock', 'average_cost', 'purchase_price']) expect(calls.insert[0]).not.toHaveProperty(k)
  })
})
