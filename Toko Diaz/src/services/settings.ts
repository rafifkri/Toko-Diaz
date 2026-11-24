import { supabase } from '../lib/supabase'
import { ok, blank } from './http'
import { extOf, remove, signedUrl, upload } from './storage'
import type { PaymentMethod, PaymentSetting, StoreProfile, StoreSettings } from '../types'
import type { StoreProfileForm } from '../schemas'

export const getStoreProfile = async (sid: string) => ok<StoreProfile>(await supabase.from('stores').select('id, store_name, address, phone, email, logo_url').eq('id', sid).single())
export const updateStoreProfile = async (sid: string, v: StoreProfileForm) =>
  ok(await supabase.from('stores').update({ store_name: v.store_name, address: blank(v.address), phone: blank(v.phone), email: blank(v.email), updated_at: new Date().toISOString() }).eq('id', sid))
export async function uploadLogo(sid: string, file: File): Promise<void> {
  const path = await upload('store-logos', `${sid}/logo.${extOf(file)}`, file)
  ok(await supabase.from('stores').update({ logo_url: path }).eq('id', sid))
}
export const logoUrl = (path: string | null) => signedUrl('store-logos', path, 3600)

const DEFAULTS = (sid: string): StoreSettings => ({ store_id: sid, receipt_footer: 'Terima kasih sudah berbelanja', receipt_width: 58, auto_print_receipt: false, default_unit: 'pcs', default_minimum_stock: 0 })
export async function getStoreSettings(sid: string): Promise<StoreSettings> {
  const row = ok<StoreSettings | null>(await supabase.from('store_settings').select('*').eq('store_id', sid).maybeSingle())
  return row ?? DEFAULTS(sid)
}
export const saveStoreSettings = async (sid: string, v: Partial<StoreSettings>) =>
  ok(await supabase.from('store_settings').upsert({ ...v, store_id: sid, updated_at: new Date().toISOString() }, { onConflict: 'store_id' }))

export const listPaymentSettings = async (sid: string) => ok<PaymentSetting[]>(await supabase.from('store_payment_settings').select('*').eq('store_id', sid))
export const savePaymentSetting = async (sid: string, method: PaymentMethod, v: Partial<PaymentSetting>) =>
  ok(await supabase.from('store_payment_settings').upsert({ ...v, store_id: sid, payment_method: method, updated_at: new Date().toISOString() }, { onConflict: 'store_id,payment_method' }))
export async function uploadQris(sid: string, file: File): Promise<void> {
  const path = await upload('qris-images', `${sid}/qris.${extOf(file)}`, file)
  await savePaymentSetting(sid, 'qris', { qris_path: path, is_active: true })
}
export async function removeQris(sid: string, path: string): Promise<void> {
  await remove('qris-images', [path])
  await savePaymentSetting(sid, 'qris', { qris_path: null, is_active: false })
}
export const qrisUrl = (path: string | null) => signedUrl('qris-images', path, 600)
