import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Pencil } from 'lucide-react'
import { getSupplier } from '../../services/master'
import { listSupplierPurchases } from '../../services/purchases'
import DataTable, { type Column } from '../../components/ui/DataTable'
import { Badge, ErrorState, PageHeader, Skeleton, StatCard, StatusBadge, purchasePay, receivingStatus } from '../../components/ui/feedback'
import { dateLabel, rupiah } from '../../utils/format'
import type { Purchase } from '../../types'
import { SupplierModal } from './Suppliers'

export default function SupplierDetail() {
  const { id = '' } = useParams()
  const [edit, setEdit] = useState(false)
  const sup = useQuery({ queryKey: ['supplier', id], queryFn: () => getSupplier(id) })
  const hist = useQuery({ queryKey: ['supplier-purchases', id], queryFn: () => listSupplierPurchases(id) })
  if (sup.isError) return <div className="card"><ErrorState message="Supplier tidak ditemukan." onRetry={() => void sup.refetch()} /></div>
  if (!sup.data) return <Skeleton className="h-48" />
  const s = sup.data
  const received = (hist.data ?? []).filter(p => p.receiving_status === 'received')
  const total = received.reduce((a, p) => a + p.total_amount, 0)
  const unpaid = received.reduce((a, p) => a + p.total_amount - p.paid_amount, 0)
  const cols: Column<Purchase>[] = [
    { key: 'n', header: 'No. pembelian', cell: p => <Link className="link" to={`/purchases/${p.id}`}>{p.purchase_number}</Link> },
    { key: 'd', header: 'Tanggal', cell: p => dateLabel(p.purchase_date) },
    { key: 't', header: 'Total', align: 'right', cell: p => rupiah(p.total_amount) },
    { key: 'u', header: 'Sisa utang', align: 'right', cell: p => (p.receiving_status === 'received' ? rupiah(p.total_amount - p.paid_amount) : '-') },
    { key: 'p', header: 'Pembayaran', cell: p => <StatusBadge map={purchasePay} value={p.payment_status} /> },
    { key: 'r', header: 'Penerimaan', cell: p => <StatusBadge map={receivingStatus} value={p.receiving_status} /> },
  ]
  return (
    <div className="space-y-5">
      {edit && <SupplierModal item={s} onClose={() => setEdit(false)} />}
      <Link to="/suppliers" className="link inline-flex items-center gap-1 text-sm"><ArrowLeft size={14} />Semua supplier</Link>
      <PageHeader title={s.supplier_name} description={[s.contact_person, s.phone, s.address].filter(Boolean).join(' · ') || 'Belum ada data kontak'}
        actions={<><Badge tone={s.is_active ? 'green' : 'slate'}>{s.is_active ? 'Aktif' : 'Nonaktif'}</Badge><button className="btn-secondary" onClick={() => setEdit(true)}><Pencil size={15} />Ubah</button></>} />
      {s.notes && <p className="card text-sm text-slate-600">{s.notes}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Jumlah pembelian" value={received.length} icon={<span className="text-sm font-bold">#</span>} />
        <StatCard label="Total pembelian" value={rupiah(total)} icon={<span className="text-sm font-bold">Rp</span>} tone="blue" />
        <StatCard label="Utang berjalan" value={rupiah(unpaid)} icon={<span className="text-sm font-bold">!</span>} tone={unpaid > 0 ? 'red' : 'green'} />
      </div>
      <h2 className="font-bold">Riwayat transaksi</h2>
      <DataTable columns={cols} rows={hist.data} rowKey={p => p.id} loading={hist.isLoading} error={hist.isError} onRetry={() => void hist.refetch()} empty={{ title: 'Belum ada pembelian dari supplier ini' }} />
    </div>)
}
