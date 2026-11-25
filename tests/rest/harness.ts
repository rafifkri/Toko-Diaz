import { createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'

/**
 * Harness uji REST: menjalankan kode services/ asli lewat supabase-js ke PostgREST + Postgres sungguhan.
 * Butuh: Postgres dengan skema (migrasi 0001+), PostgREST di REST_URL, dan JWT secret yang sama.
 * Lihat tests/rest/README.md.
 */
export const REST_URL = process.env.REST_URL ?? 'http://localhost:3000'
export const JWT_SECRET = process.env.REST_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

export function jwt(sub: string | null): string {
  const h = b64({ alg: 'HS256', typ: 'JWT' })
  const p = b64({ sub: sub ?? undefined, role: sub ? 'authenticated' : 'anon', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })
  return `${h}.${p}.${createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`
}

let current: string | null = null
export const as = (uid: string | null) => { current = uid ? jwt(uid) : null }
export const token = () => current

/** SQL langsung sebagai superuser (menyiapkan data yang di produksi dibuat Supabase Auth). */
export function sql(q: string): string {
  const cmd = process.env.PSQL_CMD
  const out = cmd ? execFileSync('bash', ['-c', `${cmd} -tA -c "$Q"`], { env: { ...process.env, Q: q } })
    : execFileSync('su', ['postgres', '-c', `psql -d toko -tA -c "$Q"`], { env: { ...process.env, Q: q } })
  return out.toString().trim()
}
export const newUser = (email: string, name: string) =>
  sql(`insert into auth.users (email, raw_user_meta_data) values ('${email}', jsonb_build_object('full_name','${name}')) returning id`).split('\n')[0]
