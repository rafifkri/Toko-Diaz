import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..')
const migrationsDir = join(root, 'supabase', 'migrations')

export type Db = PGlite

/** Membuat database baru, menjalankan penyangga Supabase lalu seluruh migrasi berurutan. */
export async function createDb(): Promise<Db> {
  const db = new PGlite()
  await db.exec(readFileSync(join(__dirname, 'bootstrap.sql'), 'utf8'))
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
  for (const f of files) {
    // gen_random_uuid() sudah bawaan Postgres 13+, ekstensi pgcrypto tidak tersedia di PGlite
    const sql = readFileSync(join(migrationsDir, f), 'utf8').replace(/create extension if not exists pgcrypto;/gi, '')
    try { await db.exec(sql) } catch (e) { throw new Error(`Migrasi ${f} gagal: ${(e as Error).message}`) }
  }
  return db
}

/** Menjalankan satu query sebagai pengguna tertentu (meniru JWT Supabase + role authenticated). */
export async function asUser<T = Record<string, unknown>>(db: Db, uid: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? ''])
  try { return (await db.query<T>(sql, params)).rows } finally { await db.exec('reset role') }
}

export async function newUser(db: Db, email: string, name: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('full_name', $2::text)) returning id`, [email, name])
  return r.rows[0].id
}
