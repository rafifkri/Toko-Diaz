import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { useStore } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDialog } from '../../contexts/DialogContext'
import { useDebounced } from '../../hooks'
import { usePrintReceipt } from '../../hooks/print'
import { cancelPending, listSales, type SaleFilters } from '../../services/sales'
import DataTable, { type Column } from '../../components/ui/DataTable'
import { PageHeader, StatusBadge, saleStatus } from '../../components/ui/feedback'
import { DatePicker, FilterBar, SearchInput } from '../../components/ui/inputs'
import { errMsg } from '../../utils/errors'
import { dateTimeLabel, rupiah } from '../../utils/format'
import type { PaymentMethod, Sale, SaleStatus } from '../../types'
import PendingPayment from '../pos/PendingPayment'
import SaleDetailModal from './SaleDetailModal'

const METHOD: Record<PaymentMethod, string> = { cash: 'Tunai', transfer: 'Transfer', qris: 'QRIS' }
const SIZE = 15

export default function SalesHistory() {
  const { storeId, isOwner } = useStore(); const toast = useToast(); const dialog = useDialog(); const qc = useQueryClient(); const print = usePrintReceipt()
  const [params] = useSearchParams()
  const [search, setSearch] = useState(''); const q = useDebounced(search)
  const [status, setStatus] = useState<'' | SaleStatus>((params.get('status') as SaleStatus | null) ?? '')
  const [method, setMethod] = useState<'' | PaymentMethod>(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<string | null>(null); const [resume, setResume] = useState<Sale | null>(null)
  const filters: SaleFilters = { search: q, status, method, from, to, page, size: SIZE }
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['sales', storeId, filters], queryFn: () => listSales(storeId, filters), placeholderData: prev => prev })
  const reset = (fn: () => void) => { fn(); setPage(1) }
  const refresh = () => { for (const k of ['sales', 'pending-sales', 'cashier-summary', 'products', 'pos-products', 'dashboard', 'receipt']) void qc.invalidateQueries({ queryKey: [k] }) }
  const cancel = useMutation({ mutationFn: (id: string) => cancelPending(id), onSuccess: () => { toast.success('Transaksi dibatalkan.'); refresh() }, onError: e => toast.error(errMsg(e)) })
  const askCancel = async (s: Sale) => { if (await dialog.confirm({ title: 'Batalkan transaksi?', message: `${s.invoice_number} akan dibatalkan dan stok tidak berubah.`, confirmText: 'Batalkan transaksi', danger: true })) cancel.mutate(s.id) }

  if (resume) return <PendingPayment sale={resume} onDone={m => { setResume(null); toast.success(m); refresh() }} onClose={() => setResume(null)} />
  const cols: Column<Sale>[] = [
    { key: 'i', header: 'Invoice', cell: s => <button className="link" onClick={() => setDetail(s.id)}>{s.invoice_number}</button> },
    { key: 'd', header: 'Waktu', cell: s => dateTimeLabel(s.sale_date) }, { key: 'm', header: 'Metode', cell: s => METHOD[s.payment_method] },
    { key: 't', header: 'Total', align: 'right', cell: s => <span><b>{rupiah(s.total_amount)}</b>{s.refunded_amount > 0 && <span className="block text-xs text-blue-600">refund {rupiah(s.refunded_amount)}</span>}</span> },
    { key: 's', header: 'Status', cell: s => <StatusBadge map={saleStatus} value={s.payment_status} /> },
    { key: 'a', header: '', align: 'right', cell: s => s.payment_status === 'pending'
      ? <span className="space-x-3 whitespace-nowrap"><button className="btn-primary btn-sm" onClick={() => setResume(s)}>Lanjutkan pembayaran</button><button className="text-red-600 hover:underline" onClick={() => void askCancel(s)}>Batalkan</button></span>
      : <span className="space-x-3 whitespace-nowrap"><button className="link" onClick={() => setDetail(s.id)}>Detail</button>{(s.payment_status === 'paid' || s.payment_status === 'refunded') && <button className="text-slate-500 hover:text-slate-800" aria-label="Cetak struk" onClick={() => void print(s.id)}><Printer size={15} className="inline" /></button>}</span> },
  ]
  return (
    <div className="space-y-5">
      {detail && <SaleDetailModal saleId={detail} onClose={() => { setDetail(null); refresh() }} />}
      <PageHeader title="Riwayat Penjualan" description={isOwner ? 'Seluruh transaksi toko.' : 'Transaksi yang Anda buat. Transaksi pending dapat dilanjutkan di sini.'} />
      <FilterBar>
        <SearchInput className="w-full sm:w-64" value={search} onChange={v => reset(() => setSearch(v))} placeholder="Cari nomor invoice" />
        <select className="input w-auto" value={status} onChange={e => reset(() => setStatus(e.target.value as '' | SaleStatus))} aria-label="Filter status"><option value="">Semua status</option>{Object.entries(saleStatus).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="input w-auto" value={method} onChange={e => reset(() => setMethod(e.target.value as '' | PaymentMethod))} aria-label="Filter metode"><option value="">Semua metode</option>{Object.entries(METHOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <DatePicker className="w-40" value={from} onChange={v => reset(() => setFrom(v))} placeholder="Dari tanggal" clearable max={to || undefined} />
        <DatePicker className="w-40" value={to} onChange={v => reset(() => setTo(v))} placeholder="Sampai tanggal" clearable min={from || undefined} />
      </FilterBar>
      <DataTable columns={cols} rows={data?.rows} rowKey={s => s.id} loading={isLoading} error={isError} onRetry={() => void refetch()} page={page} size={SIZE} total={data?.total} onPage={setPage}
        rowClass={s => (s.payment_status === 'pending' ? 'bg-amber-50/40' : '')} empty={{ title: 'Belum ada transaksi', description: 'Transaksi dari kasir akan tampil di sini.' }} />
    </div>)
}
