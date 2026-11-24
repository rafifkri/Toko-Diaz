import { supabase } from '../lib/supabase'
import { ok, blank, pageRange } from './http'
import type { Category, Page, Supplier } from '../types'
import type { CategoryForm, SupplierForm } from '../schemas'

export const listCategories = async (sid: string) =>
  ok<Category[]>(await supabase.from('categories').select('*').eq('store_id', sid).order('category_name'))
export const createCategory = async (sid: string, v: CategoryForm) =>
  ok(await supabase.from('categories').insert({ store_id: sid, category_name: v.category_name, description: blank(v.description) }))
export const updateCategory = async (id: string, v: CategoryForm) =>
  ok(await supabase.from('categories').update({ category_name: v.category_name, description: blank(v.description) }).eq('id', id))
export const deleteCategory = async (id: string) => ok(await supabase.from('categories').delete().eq('id', id))

const supplierPayload = (v: SupplierForm) => ({
  supplier_name: v.supplier_name, phone: blank(v.phone), contact_person: blank(v.contact_person), address: blank(v.address), notes: blank(v.notes),
})
export const listSuppliers = async (sid: string, search: string, page: number, size: number): Promise<Page<Supplier>> => {
  const [from, to] = pageRange(page, size)
  let q = supabase.from('suppliers').select('*', { count: 'exact' }).eq('store_id', sid)
  if (search.trim()) q = q.ilike('supplier_name', `%${search.trim().replace(/[%_,()]/g, ' ')}%`)
  const res = await q.order('supplier_name').range(from, to)
  if (res.error) throw res.error
  return { rows: (res.data ?? []) as Supplier[], total: res.count ?? 0 }
}
export const listActiveSuppliers = async (sid: string) =>
  ok<Pick<Supplier, 'id' | 'supplier_name'>[]>(await supabase.from('suppliers').select('id, supplier_name').eq('store_id', sid).eq('is_active', true).order('supplier_name'))
export const getSupplier = async (id: string) => ok<Supplier>(await supabase.from('suppliers').select('*').eq('id', id).single())
export const createSupplier = async (sid: string, v: SupplierForm) => ok(await supabase.from('suppliers').insert({ ...supplierPayload(v), store_id: sid }))
export const updateSupplier = async (id: string, v: SupplierForm) => ok(await supabase.from('suppliers').update(supplierPayload(v)).eq('id', id))
export const setSupplierActive = async (id: string, active: boolean) => ok(await supabase.from('suppliers').update({ is_active: active }).eq('id', id))
