import { supabase } from '../lib/supabase'
import { ok, pageRange, rpc, blank } from './http'
import { sanitizeSearch } from '../utils/search'
import { signedUrls, upload, extOf } from './storage'
import type { Page, PosProduct, Product, ProductOption, ProductRow, StockMovement, StockStatus } from '../types'
import type { ProductForm } from '../schemas'

export interface ProductFilters { search: string; categoryId: string; stock: '' | StockStatus; active: '' | '1' | '0'; page: number; size: number }

export async function listProducts(sid: string, f: ProductFilters): Promise<Page<ProductRow>> {
  const [from, to] = pageRange(f.page, f.size)
  let q = supabase.from('products_owner').select('*', { count: 'exact' }).eq('store_id', sid)
  const s = sanitizeSearch(f.search)
  if (s) q = q.or(`product_name.ilike.%${s}%,product_code.ilike.%${s}%,barcode.ilike.%${s}%`)
  if (f.categoryId) q = q.eq('category_id', f.categoryId)
  if (f.stock) q = q.eq('stock_status', f.stock)
  if (f.active) q = q.eq('is_active', f.active === '1')
  const res = await q.order('product_name').range(from, to)
  if (res.error) throw res.error
  return { rows: (res.data ?? []) as ProductRow[], total: res.count ?? 0 }
}

/** Semua produk sesuai filter, diambil bertahap (untuk export). */
export async function listAllProducts(sid: string, f: Omit<ProductFilters, 'page' | 'size'>): Promise<ProductRow[]> {
  const out: ProductRow[] = []
  for (let page = 1; page <= 50; page++) {
    const { rows } = await listProducts(sid, { ...f, page, size: 1000 })
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

export const getProduct = async (id: string) => ok<ProductRow>(await supabase.from('products_owner').select('*').eq('id', id).single())

export async function listProductOptions(sid: string): Promise<ProductOption[]> {
  return ok<ProductOption[]>(await supabase.from('products').select('id, product_code, product_name, unit, purchase_price, stock')
    .eq('store_id', sid).eq('is_active', true).order('product_name').limit(1000))
}

// product_code ditetapkan saat produk dibuat dan tidak dapat diubah (hak UPDATE kolom itu memang ditutup di database).
const editable = (v: ProductForm) => ({
  product_name: v.product_name, unit: v.unit, selling_price: v.selling_price, minimum_stock: v.minimum_stock,
  barcode: blank(v.barcode), category_id: blank(v.category_id),
})

export async function createProduct(sid: string, v: ProductForm, photo?: File | null): Promise<string> {
  const row = ok<{ id: string }>(await supabase.from('products').insert({ ...editable(v), product_code: v.product_code, store_id: sid }).select('id').single())
  if (photo) await setProductPhoto(sid, row.id, photo)
  if (v.initial_stock && v.initial_stock > 0) {
    await rpc('adjust_stock', { p_product: row.id, p_delta: v.initial_stock, p_reason: 'Stok awal', p_type: 'adjustment', p_unit_cost: v.initial_cost ?? null })
  }
  return row.id
}

export async function updateProduct(sid: string, id: string, v: ProductForm, photo?: File | null): Promise<void> {
  const image = photo ? await setProductPhoto(sid, id, photo, false) : undefined
  ok(await supabase.from('products').update({ ...editable(v), ...(image ? { image_url: image } : {}), updated_at: new Date().toISOString() }).eq('id', id))
}

async function setProductPhoto(sid: string, id: string, file: File, save = true): Promise<string> {
  const path = await upload('product-images', `${sid}/${id}.${extOf(file)}`, file)
  if (save) ok(await supabase.from('products').update({ image_url: path }).eq('id', id))
  return path
}

export async function setProductActive(id: string, active: boolean): Promise<void> {
  ok(await supabase.from('products').update({ is_active: active, updated_at: new Date().toISOString() }).eq('id', id))
}

export async function importProducts(sid: string, rows: { product_code: string; product_name: string; unit: string; barcode: string | null; selling_price: number; minimum_stock: number }[]): Promise<void> {
  ok(await supabase.from('products').upsert(rows.map(r => ({ ...r, store_id: sid })), { onConflict: 'store_id,product_code', ignoreDuplicates: true }))
}

export async function listMovements(productId: string, page: number, size: number): Promise<Page<StockMovement>> {
  const [from, to] = pageRange(page, size)
  const res = await supabase.from('stock_movements').select('*', { count: 'exact' }).eq('product_id', productId).order('created_at', { ascending: false }).range(from, to)
  if (res.error) throw res.error
  return { rows: (res.data ?? []) as StockMovement[], total: res.count ?? 0 }
}

/** Produk untuk kasir (tanpa harga modal) beserta URL foto. */
export async function listPosProducts(sid: string): Promise<PosProduct[]> {
  const data = ok<Omit<PosProduct, 'photo'>[]>(await supabase.from('products_pos').select('*').eq('store_id', sid).order('product_name').limit(1000))
  const urls = await signedUrls('product-images', data.flatMap(p => (p.image_url ? [p.image_url] : [])))
  return data.map(p => ({ ...p, photo: p.image_url ? urls[p.image_url] ?? null : null }))
}

export type { Product }
