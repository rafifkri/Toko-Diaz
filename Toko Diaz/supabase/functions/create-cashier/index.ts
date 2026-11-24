// Deploy: supabase functions deploy create-cashier
// Aksi: "create" (buat akun kasir) dan "reset_password" (owner mengganti kata sandi kasir).
// Service Role Key hanya ada di lingkungan function, tidak pernah di browser.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*' // isi dengan domain produksi, mis. https://toko-diaz.vercel.app
const cors = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const MIN_PASSWORD = 8
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405)
  const url = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Tidak terautentikasi' }, 401)

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const action = String(body.action ?? 'create')
  const storeId = String(body.store_id ?? '')
  const password = String(body.password ?? '')
  if (!storeId) return json({ error: 'Data tidak lengkap.' }, 400)
  if (password.length < MIN_PASSWORD) return json({ error: `Kata sandi minimal ${MIN_PASSWORD} karakter.` }, 400)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: own } = await admin.from('store_users').select('id').eq('store_id', storeId).eq('user_id', user.id).eq('role', 'owner').eq('is_active', true).maybeSingle()
  if (!own) return json({ error: 'Hanya owner yang dapat melakukan tindakan ini' }, 403)

  if (action === 'create') {
    const email = String(body.email ?? '').trim().toLowerCase()
    const fullName = String(body.full_name ?? '').trim()
    if (!EMAIL.test(email) || fullName.length < 2) return json({ error: 'Nama atau email tidak valid.' }, 400)
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } })
    if (error || !created.user) return json({ error: 'Akun gagal dibuat. Email mungkin sudah terdaftar.' }, 400)
    const { error: e2 } = await admin.from('store_users').insert({ store_id: storeId, user_id: created.user.id, role: 'cashier' })
    if (e2) { await admin.auth.admin.deleteUser(created.user.id); return json({ error: 'Gagal menambahkan ke toko' }, 400) }
    return json({ ok: true })
  }

  if (action === 'reset_password') {
    const targetId = String(body.user_id ?? '')
    // Hanya kasir pada toko yang sama; owner mengganti sandinya sendiri lewat halaman Profil.
    const { data: target } = await admin.from('store_users').select('id, role').eq('store_id', storeId).eq('user_id', targetId).maybeSingle()
    if (!target || target.role !== 'cashier') return json({ error: 'Pengguna tidak ditemukan atau bukan kasir.' }, 404)
    const { error } = await admin.auth.admin.updateUserById(targetId, { password })
    if (error) return json({ error: 'Kata sandi gagal diganti.' }, 400)
    return json({ ok: true })
  }

  return json({ error: 'Aksi tidak dikenal' }, 400)
})
