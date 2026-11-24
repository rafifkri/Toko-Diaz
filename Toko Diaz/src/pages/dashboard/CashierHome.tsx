import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Banknote, Clock, Receipt, ScanLine } from 'lucide-react'
import { useStore } from '../../contexts/AuthContext'
import { getCashierSummary } from '../../services/dashboard'
import { ErrorState, PageHeader, StatCard, Skeleton } from '../../components/ui/feedback'
import { rupiah } from '../../utils/format'

export default function CashierHome() {
  const { storeId, storeName } = useStore()
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['cashier-summary', storeId], queryFn: () => getCashierSummary(storeId) })
  return (
    <div className="space-y-6">
      <PageHeader title={`Halo, selamat bertugas`} description={`${storeName} · ringkasan transaksi Anda hari ini`} />
      {isError ? <div className="card"><ErrorState onRetry={() => void refetch()} /></div> : (
        <div className="grid gap-4 sm:grid-cols-3">
          {isLoading ? [0, 1, 2].map(i => <Skeleton key={i} className="h-24" />) : <>
            <StatCard label="Penjualan Anda hari ini" value={rupiah(data?.sales)} icon={<Banknote size={20} />} tone="green" />
            <StatCard label="Transaksi lunas" value={data?.transactions ?? 0} icon={<Receipt size={20} />} />
            <StatCard label="Menunggu pembayaran" value={data?.pending ?? 0} icon={<Clock size={20} />} tone="amber" hint={data?.pending ? 'Buka Riwayat untuk menyelesaikan' : undefined} />
          </>}
        </div>)}
      <Link to="/pos" className="btn-primary px-6 py-4 text-base"><ScanLine size={20} />Mulai berjualan</Link>
    </div>)
}
