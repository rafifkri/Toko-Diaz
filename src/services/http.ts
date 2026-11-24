import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/** Membuka hasil query Supabase: melempar error bila ada, mengembalikan data bertipe T. */
export function ok<T>(res: { data: unknown; error: PostgrestError | null }): T {
  if (res.error) throw res.error
  return res.data as T
}

export async function rpc<T = void>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

/** Kolom rentang baris untuk paginasi server (1-based page). */
export const pageRange = (page: number, size: number): [number, number] => [(page - 1) * size, page * size - 1]

export const blank = (v: string | undefined | null): string | null => (v && v.trim() ? v.trim() : null)
