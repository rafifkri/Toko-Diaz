import { supabase } from '../lib/supabase'
import { ok, rpc } from './http'
import type { Member, Role } from '../types'
import type { CashierForm } from '../schemas'

export const listMembers = async (sid: string) =>
  ok<Member[]>(await supabase.from('store_users').select('id, user_id, role, is_active, profiles(full_name, email)').eq('store_id', sid).order('created_at'))

async function callEdge(body: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.functions.invoke('create-cashier', { body })
  if (error) {
    // Respons non-2xx tidak membawa pesan di `data`; baca isi respons agar pesan bisnis sampai ke pengguna.
    let msg = 'Permintaan gagal. Coba lagi.'
    try { const res = (error as { context?: Response }).context; const b = res ? ((await res.json()) as { error?: string }) : null; if (b?.error) msg = b.error } catch { /* abaikan */ }
    throw new Error(msg)
  }
  const msg = (data as { error?: string } | null)?.error
  if (msg) throw new Error(msg)
}
export const createCashier = (sid: string, v: CashierForm) => callEdge({ action: 'create', store_id: sid, ...v })
export const resetCashierPassword = (sid: string, userId: string, password: string) => callEdge({ action: 'reset_password', store_id: sid, user_id: userId, password })
export const setMemberActive = (memberId: string, active: boolean) => rpc('set_member_active', { p_member: memberId, p_active: active })
export const setMemberRole = (memberId: string, role: Role) => rpc('set_member_role', { p_member: memberId, p_role: role })
