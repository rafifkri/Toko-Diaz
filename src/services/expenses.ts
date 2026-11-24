import { supabase } from '../lib/supabase'
import { ok, pageRange, rpc, blank } from './http'
import { extOf, remove, signedUrl, upload } from './storage'
import type { Expense, ExpenseCategory, Page } from '../types'
import type { ExpenseForm } from '../schemas'

export interface ExpenseFilters { from: string; to: string; category: string; status: '' | 'active' | 'voided'; page: number; size: number }

export async function listExpenses(sid: string, f: ExpenseFilters): Promise<Page<Expense> & { sum: number }> {
  const [a, b] = pageRange(f.page, f.size)
  let q = supabase.from('expenses').select('*', { count: 'exact' }).eq('store_id', sid)
  if (f.from) q = q.gte('expense_date', f.from)
  if (f.to) q = q.lte('expense_date', f.to)
  if (f.category) q = q.eq('category', f.category)
  if (f.status) q = q.eq('status', f.status)
  const res = await q.order('expense_date', { ascending: false }).order('created_at', { ascending: false }).range(a, b)
  if (res.error) throw res.error
  // Total nominal aktif sesuai filter (terpisah dari halaman yang tampil)
  let sq = supabase.from('expenses').select('amount').eq('store_id', sid).eq('status', 'active').limit(5000)
  if (f.from) sq = sq.gte('expense_date', f.from)
  if (f.to) sq = sq.lte('expense_date', f.to)
  if (f.category) sq = sq.eq('category', f.category)
  const sum = ok<{ amount: number }[]>(await sq).reduce((t, r) => t + r.amount, 0)
  return { rows: (res.data ?? []) as Expense[], total: res.count ?? 0, sum }
}

export async function saveExpense(sid: string, id: string | null, v: ExpenseForm, receipt?: File | null): Promise<void> {
  let path: string | null = null
  if (receipt) path = await upload('expense-receipts', `${sid}/${crypto.randomUUID()}.${extOf(receipt)}`, receipt)
  const base = { p_date: v.expense_date, p_category: v.category, p_desc: blank(v.description), p_amount: v.amount, p_method: v.payment_method, p_receipt: path }
  if (id) await rpc('update_expense', { p_id: id, ...base })
  else await rpc('add_expense', { p_store: sid, ...base })
}
export const voidExpense = (id: string, reason: string) => rpc('void_expense', { p_id: id, p_reason: reason })
export const receiptUrl = (path: string | null) => signedUrl('expense-receipts', path)
export const removeReceipt = (path: string) => remove('expense-receipts', [path])

export const listExpenseCategories = async (sid: string) =>
  ok<ExpenseCategory[]>(await supabase.from('expense_categories').select('*').eq('store_id', sid).order('category_name'))
export const addExpenseCategory = async (sid: string, name: string) => ok(await supabase.from('expense_categories').insert({ store_id: sid, category_name: name.trim() }))
export const renameExpenseCategory = async (id: string, name: string) => ok(await supabase.from('expense_categories').update({ category_name: name.trim() }).eq('id', id))
export const setExpenseCategoryActive = async (id: string, active: boolean) => ok(await supabase.from('expense_categories').update({ is_active: active }).eq('id', id))
