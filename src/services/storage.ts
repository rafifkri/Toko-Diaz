import { supabase } from '../lib/supabase'

export type Bucket = 'product-images' | 'qris-images' | 'store-logos' | 'expense-receipts'
const ALLOWED = ['image/png', 'image/jpeg']

/** Validasi gambar sisi klien (batas sebenarnya juga dijaga bucket Supabase). */
export function validateImage(file: File, maxMb = 2): string | null {
  if (!ALLOWED.includes(file.type)) return 'Format harus PNG atau JPG.'
  if (file.size > maxMb * 1024 * 1024) return `Ukuran maksimal ${maxMb} MB.`
  return null
}
export const extOf = (file: File): string => (file.type === 'image/png' ? 'png' : 'jpg')

export async function upload(bucket: Bucket, path: string, file: File): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  return path
}
export async function remove(bucket: Bucket, paths: string[]): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove(paths)
  if (error) throw error
}
export async function signedUrl(bucket: Bucket, path: string | null | undefined, ttl = 600): Promise<string | null> {
  if (!path) return null
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, ttl)
  return data?.signedUrl ?? null
}
export async function signedUrls(bucket: Bucket, paths: string[], ttl = 3600): Promise<Record<string, string>> {
  if (!paths.length) return {}
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, ttl)
  return Object.fromEntries((data ?? []).flatMap(x => (x.path && x.signedUrl ? [[x.path, x.signedUrl]] : [])))
}
