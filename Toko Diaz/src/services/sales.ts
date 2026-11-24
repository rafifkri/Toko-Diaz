import { supabase } from '../lib/supabase'
import { ok, pageRange, rpc } from './http'
import { endOfDayJakarta, startOfDayJakarta } from '../utils/period'
import type { Page, PaymentMethod, Receipt, RefundLine, Sale, SaleReturn, SaleStatus } from '../types'

export interface SaleInput { storeId: string; items: { product_id: string; quantity: number }[]; discount: number; method: PaymentMethod; received?: number; reference?: string }

export const createSale = (i: SaleInput) =>
  rpc<string>('create_sale', { p_store: i.storeId, p_items: i.items, p_discount: i.discount, p_method: i.method, p_reference: i.reference || null, p_received: i.received ?? null })
export const confirmPayment = (id: string, reference?: string) => rpc('confirm_payment', { p_sale: id, p_reference: reference || null })
export const cancelPending = (id: string) => rpc('cancel_pending_sale', { p_sale: id })
export const failPending = (id: string, reason?: string) => rpc('fail_pending_sale', { p_sale: id, p_reason: reason || null })
export const refundSale = (id: string, reason: string, restock: boolean, items?: RefundLine[]) =>
  rpc<string>('refund_sale', { p_sale: id, p_reason: reason, p_restock: restock, p_items: items ?? null })
export const getReceipt = (id: string) => rpc<Receipt>('get_receipt', { p_sale: id })

export interface SaleFilters { search: string; status: '' | SaleStatus; method: '' | PaymentMethod; from: string; to: string; page: number; size: number }

/** Kasir otomatis hanya melihat transaksinya sendiri (dijaga RLS). */
export async function listSales(sid: string, f: SaleFilters): Promise<Page<Sale>> {
  const [a, b] = pageRange(f.page, f.size)
  let q = supabase.from('sales').select('*', { count: 'exact' }).eq('store_id', sid)
  if (f.search.trim()) q = q.ilike('invoice_number', `%${f.search.trim().replace(/[%_,()]/g, ' ')}%`)
  if (f.status) q = q.eq('payment_status', f.status)
  if (f.method) q = q.eq('payment_method', f.method)
  if (f.from) q = q.gte('sale_date', startOfDayJakarta(f.from))
  if (f.to) q = q.lt('sale_date', endOfDayJakarta(f.to))
  const res = await q.order('sale_date', { ascending: false }).range(a, b)
  if (res.error) throw res.error
  return { rows: (res.data ?? []) as Sale[], total: res.count ?? 0 }
}

export const getSale = async (id: string) => ok<Sale>(await supabase.from('sales').select('*').eq('id', id).single())
export const listPendingSales = async (sid: string) =>
  ok<Sale[]>(await supabase.from('sales').select('*').eq('store_id', sid).eq('payment_status', 'pending').order('sale_date', { ascending: false }).limit(20))

export const listReturns = async (saleId: string) =>
  ok<SaleReturn[]>(await supabase.from('sale_returns').select('id, sale_id, return_number, reason, refund_amount, restock, created_at').eq('sale_id', saleId).order('created_at'))
