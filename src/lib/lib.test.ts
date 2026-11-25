import { afterEach, describe, expect, it, vi } from 'vitest'
import { appUrl } from './paths'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('appUrl', () => {
  it('memakai origin dan base path aplikasi', () => {
    vi.stubEnv('BASE_URL', '/Toko-Diaz/')
    expect(appUrl('reset-password')).toBe(`${window.location.origin}/Toko-Diaz/reset-password`)
    expect(appUrl('/login')).toBe(`${window.location.origin}/Toko-Diaz/login`)
    expect(appUrl()).toBe(`${window.location.origin}/Toko-Diaz/`)
  })
})

describe('konfigurasi Supabase', () => {
  it('menandai konfigurasi kosong atau placeholder sebagai error tanpa melempar saat modul dimuat', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', ''); vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    const m = await import('./supabase')
    expect(m.configError).toMatch(/belum diisi/)
    vi.resetModules(); vi.stubEnv('VITE_SUPABASE_URL', 'https://YOUR-PROJECT.supabase.co'); vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'YOUR-ANON-KEY')
    expect((await import('./supabase')).configError).toBeTruthy()
  })
  it('konfigurasi benar tidak menghasilkan error', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co'); vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_xyz')
    expect((await import('./supabase')).configError).toBeNull()
  })
})
