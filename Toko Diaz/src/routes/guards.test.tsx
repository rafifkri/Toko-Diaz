import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

type Role = 'owner' | 'cashier'
let mock: { session: { user: { id: string; email: string } } | null; role: Role | null } = { session: null, role: null }

// Supabase palsu: hanya bagian yang dipakai AuthContext dan layout.
vi.mock('../lib/supabase', () => {
  const rows = () => (mock.role ? [{ id: 'm1', store_id: 's1', role: mock.role, stores: { store_name: 'Toko Uji' } }] : [])
  const builder = (): Record<string, unknown> => {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit', 'single', 'maybeSingle', 'range', 'gte', 'lt']) b[m] = () => b
    b.then = (res: (v: unknown) => void) => res({ data: rows(), error: null })
    return b
  }
  return { supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: mock.session } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }), signOut: () => Promise.resolve({}) },
    from: () => builder(), rpc: () => Promise.resolve({ data: null, error: { message: 'stub' } }),
    storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null }), createSignedUrls: () => Promise.resolve({ data: [] }) }) },
  } }
})

import App from '../App'
import { AuthProvider } from '../contexts/AuthContext'
import { ToastProvider } from '../contexts/ToastContext'
import { DialogProvider } from '../contexts/DialogContext'

const renderAt = (path: string) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><ToastProvider><DialogProvider><AuthProvider><App /></AuthProvider></DialogProvider></ToastProvider></MemoryRouter>
  </QueryClientProvider>)
afterEach(cleanup)
const login = (role: Role | null) => { mock = { session: role ? { user: { id: 'u1', email: 'u@toko.id' } } : null, role } }

describe('penjagaan akses per role', () => {
  it('pengunjung tanpa login diarahkan ke halaman masuk', async () => {
    login(null); renderAt('/products')
    expect(await screen.findByRole('heading', { name: 'Masuk' })).toBeTruthy()
  })
  it('kasir yang mengetik URL halaman owner mendapat penolakan yang jelas', async () => {
    login('cashier'); renderAt('/reports')
    expect(await screen.findByText('Halaman ini khusus pemilik toko')).toBeTruthy()
    expect(screen.getByText('Kembali ke Kasir')).toBeTruthy()
  })
  it('semua halaman owner menolak kasir', async () => {
    for (const path of ['/products', '/purchases', '/inventory', '/expenses', '/users', '/audit', '/settings', '/categories', '/suppliers']) {
      login('cashier'); const { unmount } = renderAt(path)
      await waitFor(() => expect(screen.getByText('Halaman ini khusus pemilik toko')).toBeTruthy()); unmount()
    }
  })
  it('menu kasir tidak memuat menu owner', async () => {
    login('cashier'); renderAt('/reports'); await screen.findByText('Halaman ini khusus pemilik toko')
    const nav = screen.getByRole('navigation', { name: 'Menu utama' })
    expect(nav.textContent).toContain('Kasir'); expect(nav.textContent).not.toContain('Laporan'); expect(nav.textContent).not.toContain('Pengguna'); expect(nav.textContent).not.toContain('Log Aktivitas')
  })
  it('owner melihat menu lengkap dan tidak ditolak', async () => {
    login('owner'); renderAt('/audit')
    expect(await screen.findByRole('heading', { name: 'Log Aktivitas' })).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: 'Menu utama' }); expect(nav.textContent).toContain('Laporan'); expect(nav.textContent).toContain('Pengaturan')
  })
  it('alamat tidak dikenal menampilkan halaman 404', async () => {
    login('owner'); renderAt('/tidak-ada'); expect(await screen.findByText('Halaman tidak ditemukan')).toBeTruthy()
  })
})
