import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useStore } from '../../contexts/AuthContext'
import { useSupplierOptions } from '../../hooks/queries'
import { listPurchases, type PurchaseFilters } from '../../services/purchases'
import DataTable, { type Column } from '../../components/ui/DataTable'
import { PageHeader, StatusBadge, purchasePay, receivingStatus } from '../../components/ui/feedback'
import { FilterBar } from '../../components/ui/inputs'
import { dateLabel, rupiah } from '../../utils/format'
import type { Purchase } from '../../types'

const SIZE = 15
export default function Purchases() {
  const { storeId } = useStore(); const nav = useNavigate()
  const [f, setF] = useState<Omit<PurchaseFilters, 'page' | 'size'>>({ receiving: '', payment: '', supplierId: '' })
  const [page, setPage] = useState(1)
  const { data: sups = [] } = useSupplierOptions()
  const filters = { ...f, page, size: SIZE }
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['purchases', storeId, filters], queryFn: () => listPurchases(storeId, filters), placeholderData: prev => prev })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF(p => ({ ...p, [k]: v })); setPage(1) }
  const cols: Column<Purchase>[] = [
    { key: 'n', header: 'No. pembelian', cell: p => <Link className="link" to={`/purchases/${p.id}`}>{p.purchase_number}</Link> },
    { key: 'd', header: 'Tanggal', cell: p => dateLabel(p.purchase_date) },
    { key: 's', header: 'Supplier', cell: p => p.suppliers?.supplier_name ?? <span className="text-slate-400">-</span> },
    { key: 't', header: 'Total', align: 'right', cell: p => rupiah(p.total_amount) },
    { key: 'u', header: 'Sisa utang', align: 'right', cell: p => (p.receiving_status === 'received' && p.total_amount > p.paid_amount ? <b className="text-red-600">{rupiah(p.total_amount - p.paid_amount)}</b> : '-') },
    { key: 'p', header: 'Pembayaran', cell: p => (p.receiving_status === 'cancelled' ? '-' : <StatusBadge map={purchasePay} value={p.payment_status} />) },
    { key: 'r', header: 'Penerimaan', cell: p => <StatusBadge map={receivingStatus} value={p.receiving_status} /> },
  ]
  return (
    <div className="space-y-5">
      <PageHeader title="Pembelian Barang" description="Stok dan HPP bertambah saat barang diterima." actions={<Link to="/purchases/new" className="btn-primary"><Plus size={16} />Pembelian baru</Link>} />
      <FilterBar>
        <select className="input w-auto" value={f.receiving} onChange={e => set('receiving', e.target.value as PurchaseFilters['receiving'])} aria-label="Filter penerimaan"><option value="">Semua penerimaan</option><option value="draft">Draft</option><option value="received">Diterima</option><option value="cancelled">Dibatalkan</option></select>
        <select className="input w-auto" value={f.payment} onChange={e => set('payment', e.target.value as PurchaseFilters['payment'])} aria-label="Filter pembayaran"><option value="">Semua pembayaran</option><option value="unpaid">Belum lunas</option><option value="partial">Dicicil</option><option value="paid">Lunas</option></select>
        <select className="input w-auto" value={f.supplierId} onChange={e => set('supplierId', e.target.value)} aria-label="Filter supplier"><option value="">Semua supplier</option>{sups.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}</select>
      </FilterBar>
      <DataTable columns={cols} rows={data?.rows} rowKey={p => p.id} loading={isLoading} error={isError} onRetry={() => void refetch()}
        page={page} size={SIZE} total={data?.total} onPage={setPage} onRowClick={p => nav(`/purchases/${p.id}`)}
        empty={{ title: 'Belum ada pembelian', description: 'Catat pembelian dari supplier agar stok dan HPP terhitung otomatis.', action: <Link to="/purchases/new" className="btn-primary">Pembelian baru</Link> }} />
    </div>)
}
