import { lazy, Suspense } from 'react'
import { useStore } from '../../contexts/AuthContext'
import { PageLoader } from '../../components/ui/feedback'
import CashierHome from './CashierHome'

// Dashboard memuat pustaka grafik; kasir tidak perlu mengunduhnya.
const Dashboard = lazy(() => import('./Dashboard'))

/** Owner melihat dashboard penuh; kasir melihat ringkasan miliknya sendiri. */
export default function Home() {
  const { isOwner } = useStore()
  return isOwner ? <Suspense fallback={<PageLoader />}><Dashboard /></Suspense> : <CashierHome />
}
