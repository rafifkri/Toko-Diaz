import { supabase } from '../lib/supabase'
import { ok, pageRange, rpc, blank } from './http'
import type { Page, Purchase, PurchaseItem, PurchaseLine, PurchaseMethod, PurchasePayment, ReceivingStatus } from '../types'
import type { PurchaseForm } from '../schemas'

export interface PurchaseFilters { receiving: '' | ReceivingStatus; payment: '' | 'unpaid' | 'partial' | 'paid'; supplierId: string; page: number; size: number }

export async function listPurchases(sid: string, f: PurchaseFilters): Promise<Page<Purchase>> {
  const [a, b] = pageRange(f.page, f.size)
  let q = supabase.from('purchases').select('*, suppliers(supplier_name)', { count: 'exact' }).eq('store_id', sid)
  if (f.receiving) q = q.eq('receiving_status', f.receiving)
  if (f.payment) q = q.eq('payment_status', f.payment)
  if (f.supplierId) q = q.eq('supplier_id', f.supplierId)
  const res = await q.order('purchase_date', { ascending: false }).order('created_at', { ascending: false }).range(a, b)
  if (res.error) throw res.error
  return { rows: (res.data ?? []) as Purchase[], total: res.count ?? 0 }
}

export interface PurchaseDetail { purchase: Purchase; items: PurchaseItem[]; payments: PurchasePayment[] }
export async function getPurchase(id: string): Promise<PurchaseDetail> {
  const [purchase, items, payments] = await Promise.all([
    supabase.from('purchases').select('*, suppliers(supplier_name)').eq('id', id).single(),
    supabase.from('purchase_items').select('*, products(product_name, unit)').eq('purchase_id', id).order('created_at'),
    supabase.from('purchase_payments').select('*').eq('purchase_id', id).order('payment_date').order('created_at'),
  ])
  return { purchase: ok<Purchase>(purchase), items: ok<PurchaseItem[]>(items), payments: ok<PurchasePayment[]>(payments) }
}

/** Riwayat pembelian + ringkasan utang per supplier. */
export async function listSupplierPurchases(supplierId: string): Promise<Purchase[]> {
  return ok<Purchase[]>(await supabase.from('purchases').select('*').eq('supplier_id', supplierId).order('purchase_date', { ascending: false }).limit(200))
}

const args = (v: PurchaseForm) => ({
  p_supplier: blank(v.supplier_id), p_items: v.lines as PurchaseLine[], p_discount: v.discount, p_paid: v.pay_on_receive,
  p_date: v.purchase_date, p_method: v.payment_method as PurchaseMethod, p_notes: blank(v.notes),
})
export const createPurchase = (sid: string, v: PurchaseForm) => rpc<string>('create_purchase', { p_store: sid, ...args(v), p_due: blank(v.due_date) })
export const updatePurchaseDraft = (id: string, v: PurchaseForm) => rpc('update_purchase_draft', { p_id: id, ...args(v), p_due: blank(v.due_date) })
export const receivePurchase = (id: string) => rpc('receive_purchase', { p_id: id })
export const cancelPurchase = (id: string) => rpc('cancel_purchase', { p_id: id })
export const payPurchase = (id: string, amount: number, method: PurchaseMethod, date: string, notes?: string) =>
  rpc('pay_purchase', { p_purchase: id, p_amount: amount, p_method: method, p_date: date, p_notes: blank(notes) })
