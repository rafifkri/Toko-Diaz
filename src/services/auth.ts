import { supabase } from '../lib/supabase'
import { ok, rpc } from './http'
import type { Membership, Role } from '../types'

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error('Email atau kata sandi salah.')
}

/** Mendaftarkan pemilik. Mengembalikan false bila perlu konfirmasi email dulu. */
export async function signUpOwner(v: { email: string; password: string; fullName: string; storeName: string }): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({ email: v.email, password: v.password, options: { data: { full_name: v.fullName } } })
  if (error) throw new Error('Pendaftaran gagal. Periksa email dan kata sandi.')
  if (!data.session) return false
  await rpc('create_store', { p_store_name: v.storeName })
  return true
}

export const createStore = (name: string) => rpc<string>('create_store', { p_store_name: name })

export async function sendResetEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
  if (error) throw error
}
export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}
export const signOut = () => supabase.auth.signOut()

interface MemberRow { id: string; store_id: string; role: Role; stores: { store_name: string } | { store_name: string }[] | null }
export async function loadMemberships(userId: string): Promise<Membership[]> {
  const rows = ok<MemberRow[]>(await supabase.from('store_users').select('id, store_id, role, stores(store_name)').eq('user_id', userId).eq('is_active', true))
  return rows.map(r => {
    const s = Array.isArray(r.stores) ? r.stores[0] : r.stores
    return { member_id: r.id, store_id: r.store_id, role: r.role, store_name: s?.store_name ?? 'Toko' }
  })
}

export interface MyProfile { id: string; full_name: string | null; email: string | null; phone: string | null }
export async function getMyProfile(userId: string): Promise<MyProfile> {
  return ok<MyProfile>(await supabase.from('profiles').select('id, full_name, email, phone').eq('id', userId).single())
}
export async function updateMyProfile(userId: string, v: { full_name: string; phone: string | null }): Promise<void> {
  ok(await supabase.from('profiles').update({ ...v, updated_at: new Date().toISOString() }).eq('id', userId))
}
