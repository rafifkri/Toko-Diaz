import { supabase } from '../lib/supabase'
import { pageRange } from './http'
import { endOfDayJakarta, startOfDayJakarta } from '../utils/period'
import type { AuditLog, Page } from '../types'

export interface AuditFilters { action: string; table: string; from: string; to: string; page: number; size: number }

export async function listAuditLogs(sid: string, f: AuditFilters): Promise<Page<AuditLog>> {
  const [a, b] = pageRange(f.page, f.size)
  let q = supabase.from('audit_logs').select('*, profiles(full_name, email)', { count: 'exact' }).eq('store_id', sid)
  if (f.action) q = q.ilike('action', `%${f.action.replace(/[%_,()]/g, ' ')}%`)
  if (f.table) q = q.eq('table_name', f.table)
  if (f.from) q = q.gte('created_at', startOfDayJakarta(f.from))
  if (f.to) q = q.lt('created_at', endOfDayJakarta(f.to))
  const res = await q.order('created_at', { ascending: false }).range(a, b)
  if (res.error) throw res.error
  return { rows: (res.data ?? []) as AuditLog[], total: res.count ?? 0 }
}
