import { supabase } from '../lib/supabase'
import { ok, pageRange, rpc } from './http'
import { endOfDayJakarta, startOfDayJakarta } from '../utils/period'
import type { MovementType, OpnameLine, Page, StockMovement, StockOpname } from '../types'

export interface MovementFilters { productId: string; type: '' | MovementType; from: string; to: string; page: number; size: number }

export async function listAllMovements(sid: string, f: MovementFilters): Promise<Page<StockMovement>> {
  const [a, b] = pageRange(f.page, f.size)
  let q = supabase.from('stock_movements').select('*, products(product_name, unit)', { count: 'exact' }).eq('store_id', sid)
  if (f.productId) q = q.eq('product_id', f.productId)
  if (f.type) q = q.eq('movement_type', f.type)
  if (f.from) q = q.gte('created_at', startOfDayJakarta(f.from))
  if (f.to) q = q.lt('created_at', endOfDayJakarta(f.to))
  const res = await q.order('created_at', { ascending: false }).range(a, b)
  if (res.error) throw res.error
  return { rows: (res.data ?? []) as StockMovement[], total: res.count ?? 0 }
}

export const adjustStock = (productId: string, delta: number, reason: string, type: 'adjustment' | 'damage_out' | 'lost_out', unitCost?: number) =>
  rpc('adjust_stock', { p_product: productId, p_delta: delta, p_reason: reason, p_type: type, p_unit_cost: unitCost ?? null })

export const createOpname = (sid: string, lines: OpnameLine[], notes?: string) =>
  rpc<string>('create_stock_opname', { p_store: sid, p_items: lines, p_notes: notes?.trim() || null })

export async function listOpnames(sid: string, page: number, size: number): Promise<Page<StockOpname>> {
  const [a, b] = pageRange(page, size)
  const res = await supabase.from('stock_opnames').select('id, opname_number, notes, created_at, stock_opname_items(id)', { count: 'exact' })
    .eq('store_id', sid).order('created_at', { ascending: false }).range(a, b)
  if (res.error) throw res.error
  return { rows: (res.data ?? []) as StockOpname[], total: res.count ?? 0 }
}

export interface OpnameDetailRow { id: string; system_qty: number; counted_qty: number; difference: number; products: { product_name: string; unit: string } | null }
export const getOpnameItems = async (id: string) =>
  ok<OpnameDetailRow[]>(await supabase.from('stock_opname_items').select('id, system_qty, counted_qty, difference, products(product_name, unit)').eq('opname_id', id))
