import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { loadMemberships, signOut as doSignOut } from '../services/auth'
import { queryClient } from '../lib/queryClient'
import { errMsg } from '../utils/errors'
import type { Membership } from '../types'

interface AuthState {
  session: Session | null
  loading: boolean
  memberships: Membership[]
  membership: Membership | null
  recovery: boolean
  loadError: string | null
  switchStore: (storeId: string) => void
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}
const Ctx = createContext<AuthState | null>(null)
const key = (uid: string) => `toko-diaz:active-store:${uid}`

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async (s: Session | null) => {
    if (!s) { setMemberships([]); setActiveId(null); setLoadError(null); return }
    try {
      const list = await loadMemberships(s.user.id)
      setMemberships(list); setLoadError(null)
      const saved = localStorage.getItem(key(s.user.id))
      setActiveId(list.find(m => m.store_id === saved)?.store_id ?? list[0]?.store_id ?? null)
    } catch (e) { setMemberships([]); setLoadError(errMsg(e, 'Gagal memuat data toko.')) }
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session); await load(data.session); if (alive) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
      // Jangan memanggil Supabase langsung di dalam callback ini (risiko deadlock): tunda.
      setTimeout(() => { void load(s) }, 0)
      if (event === 'SIGNED_OUT') queryClient.clear()
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [load])

  const value = useMemo<AuthState>(() => ({
    session, loading, memberships, recovery, loadError,
    membership: memberships.find(m => m.store_id === activeId) ?? null,
    switchStore: id => { if (session) localStorage.setItem(key(session.user.id), id); setActiveId(id); queryClient.clear() },
    refresh: () => load(session),
    signOut: async () => { await doSignOut() },
  }), [session, loading, memberships, activeId, recovery, loadError, load])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return c
}

/** Konteks toko aktif. Hanya dipakai di halaman yang sudah dijaga ProtectedRoute. */
export function useStore() {
  const { membership, session } = useAuth()
  if (!membership || !session) throw new Error('Toko aktif tidak tersedia')
  return { storeId: membership.store_id, storeName: membership.store_name, role: membership.role, isOwner: membership.role === 'owner', userId: session.user.id, email: session.user.email ?? '' }
}
