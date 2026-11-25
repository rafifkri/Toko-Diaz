import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

type AuthCb = (event: string, session: { user: { id: string; email: string } } | null) => void
const h = vi.hoisted(() => ({ cb: null as null | AuthCb }))

vi.mock('../lib/supabase', () => {
  // Daftar toko baru "tiba" setelah jeda jaringan, seperti Supabase sungguhan.
  const builder = (): Record<string, unknown> => {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit', 'single', 'maybeSingle', 'range', 'gte', 'lt']) b[m] = () => b
    b.then = (res: (v: unknown) => void) => setTimeout(() => res({ data: [{ id: 'm1', store_id: 's1', role: 'cashier', stores: { store_name: 'Toko Uji' } }], error: null }), 60)
    return b
  }
  return { supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }), signOut: () => Promise.resolve({}),
      onAuthStateChange: (cb: AuthCb) => { h.cb = cb; return { data: { subscription: { unsubscribe: () => undefined } } } } },
    from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }),
    storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null }), createSignedUrls: () => Promise.resolve({ data: [] }) }) },
  } }
})

import App from '../App'
import { AuthProvider } from './AuthContext'
import { ToastProvider } from './ToastContext'
import { DialogProvider } from './DialogContext'

afterEach(cleanup)

describe('login', () => {
  it('tidak menampilkan "belum terhubung ke toko" selagi daftar toko dimuat setelah login (regresi)', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/login']}><ToastProvider><DialogProvider><AuthProvider><App /></AuthProvider></DialogProvider></ToastProvider></MemoryRouter>
      </QueryClientProvider>)
    await screen.findByRole('heading', { name: 'Masuk' })
    let flashed = false
    const obs = new MutationObserver(() => { if (document.body.textContent?.includes('Satu langkah lagi')) flashed = true })
    obs.observe(document.body, { childList: true, subtree: true, characterData: true })
    await act(async () => { h.cb?.('SIGNED_IN', { user: { id: 'u1', email: 'k@toko.id' } }) })
    expect(await screen.findByText('Mulai berjualan', {}, { timeout: 3000 })).toBeTruthy()
    obs.disconnect()
    expect(flashed).toBe(false)
  })

})
