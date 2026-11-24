import type { ReactNode } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { PageLoader } from '../components/ui/feedback'
import NoStore from '../pages/system/NoStore'
import AppLayout from '../components/layout/AppLayout'

/** Wajib login dan terhubung ke toko; selain itu diarahkan ke halaman yang sesuai. */
export function ProtectedRoute() {
  const { session, loading, membership, recovery } = useAuth()
  const loc = useLocation()
  if (loading) return <PageLoader />
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (recovery) return <Navigate to="/reset-password" replace />
  if (!membership) return <NoStore />
  return <AppLayout><Outlet /></AppLayout>
}

export function Forbidden() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-amber-50 text-amber-600"><ShieldAlert size={28} /></div>
      <h1 className="text-xl font-bold">Halaman ini khusus pemilik toko</h1>
      <p className="mt-2 text-sm text-slate-500">Akun kasir tidak memiliki akses ke halaman ini. Hubungi pemilik toko jika Anda memerlukannya.</p>
      <Link to="/pos" className="btn-primary mt-6">Kembali ke Kasir</Link>
    </div>)
}

/** Penjagaan akses per role di sisi tampilan. Keamanan data tetap dijaga RLS di database. */
export function RequireOwner({ children }: { children: ReactNode }) {
  const { membership } = useAuth()
  return membership?.role === 'owner' ? <>{children}</> : <Forbidden />
}
