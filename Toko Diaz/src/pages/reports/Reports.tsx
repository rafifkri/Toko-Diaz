import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '../../contexts/AuthContext'
import { useCategories, useProductOptions, useSupplierOptions } from '../../hooks/queries'
import { getFinancialReport, getPurchaseReport, getSalesBreakdown, getSalesReport, type SalesFilter } from '../../services/reports'
import DataTable, { type Column } from '../../components/ui/DataTable'
import { ErrorState, PageHeader, Skeleton, StatusBadge, Tabs, purchasePay, receivingStatus, saleStatus } from '../../components/ui/feedback'
import { Combobox, FilterBar, PeriodPicker, initialPeriod, type PeriodValue } from '../../components/ui/inputs'
import { bucketDaily, type Range } from '../../utils/period'
import { dateLabel, dateTimeLabel, number, rupiah, rupiahShort } from '../../utils/format'
import type { PaymentMethod, PurchaseReport, SaleStatus, SalesBreakdown, SalesReportRow } from '../../types'
import ExportMenu from './ExportMenu'

const TABS = [['summary', 'Ringkasan'], ['sales', 'Transaksi'], ['products', 'Per produk / kategori'], ['purchases', 'Pembelian']] as const
type Tab = (typeof TABS)[number][0]
const METHOD: Record<PaymentMethod, string> = { cash: 'Tunai', transfer: 'Transfer', qris: 'QRIS' }
const SIZE = 20
const sub = (r: Range) => `Periode ${dateLabel(r[0])} s/d ${dateLabel(r[1])}`

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: 'pos' | 'neg' }) {
  return <div className={`flex justify-between py-2 ${bold ? 'font-bold' : ''}`}><span className={bold ? '' : 'text-slate-600'}>{label}</span><span className={tone === 'neg' ? 'text-red-600' : tone === 'pos' ? 'text-green-600' : ''}>{value}</span></div>
}

function Summary({ range }: { range: Range }) {
  const { storeId } = useStore()
  const { data: r, isLoading, isError, refetch } = useQuery({ queryKey: ['report-fin', storeId, range], queryFn: () => getFinancialReport(storeId, range) })
  if (isError) return <div className="card"><ErrorState onRetry={() => void refetch()} /></div>
  if (isLoading || !r) return <Skeleton className="h-96" />
  const chart = bucketDaily(r.daily, range)
  const table = () => [{ title: 'Laporan Keuangan', subtitle: sub(range), headers: ['Keterangan', 'Nilai'], rows: [
    ['Jumlah transaksi', r.transactions], ['Rata-rata nilai transaksi', r.avg_transaction], ['Penjualan kotor', r.gross_sales], ['Refund', r.refunds], ['Penjualan bersih', r.net_sales], ['HPP', r.cogs],
    ['Laba kotor', r.gross_profit], ['Pengeluaran operasional', r.expenses], ['Laba bersih', r.net_profit], ['Pembelian barang diterima', r.purchases], ['Pembayaran ke supplier', r.purchases_paid],
    ['Kas masuk', r.cash_in], ['Kas keluar', r.cash_out], ['Arus kas bersih', r.net_cash], ['Transaksi pending (jumlah)', r.pending_count], ['Transaksi pending (nominal)', r.pending_amount],
    ...Object.entries(r.by_method).map(([m, v]) => [`Penjualan ${METHOD[m as PaymentMethod]}`, v ?? 0]),
  ] }, { title: 'Penjualan Harian', subtitle: sub(range), headers: ['Tanggal', 'Penjualan'], rows: r.daily.map(d => [d.d, d.sales]) }]
  return (
    <div className="space-y-5">
      <div className="flex justify-end"><ExportMenu filename={`laporan-keuangan-${range[0]}_${range[1]}`} build={table} /></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card"><p className="mb-1 font-semibold">Laba rugi</p><div className="divide-y divide-slate-100 text-sm">
          <Row label="Penjualan kotor" value={rupiah(r.gross_sales)} /><Row label="Refund" value={`-${rupiah(r.refunds)}`} /><Row label="Penjualan bersih" value={rupiah(r.net_sales)} bold />
          <Row label="HPP (harga pokok penjualan)" value={`-${rupiah(r.cogs)}`} /><Row label="Laba kotor" value={rupiah(r.gross_profit)} bold tone={r.gross_profit >= 0 ? 'pos' : 'neg'} />
          <Row label="Pengeluaran operasional" value={`-${rupiah(r.expenses)}`} /><Row label="Laba bersih" value={rupiah(r.net_profit)} bold tone={r.net_profit >= 0 ? 'pos' : 'neg'} /></div></div>
        <div className="card"><p className="mb-1 font-semibold">Arus kas</p><div className="divide-y divide-slate-100 text-sm">
          <Row label="Kas masuk (penjualan)" value={rupiah(r.cash_in)} /><Row label="Refund" value={`-${rupiah(r.refunds)}`} /><Row label="Pengeluaran operasional" value={`-${rupiah(r.expenses)}`} />
          <Row label="Pembayaran ke supplier" value={`-${rupiah(r.purchases_paid)}`} /><Row label="Arus kas bersih" value={rupiah(r.net_cash)} bold tone={r.net_cash >= 0 ? 'pos' : 'neg'} /></div>
          <p className="mt-2 text-xs text-slate-400">Pembelian diterima periode ini: {rupiah(r.purchases)} (pembayaran dicatat saat dibayar).</p></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card"><p className="text-sm text-slate-500">Transaksi lunas</p><p className="text-2xl font-bold">{number(r.transactions)}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Rata-rata nilai transaksi</p><p className="text-2xl font-bold">{rupiah(r.avg_transaction)}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Transaksi pending</p><p className="text-2xl font-bold">{number(r.pending_count)}</p><p className="text-xs text-slate-400">{rupiah(r.pending_amount)} belum diterima (tidak dihitung sebagai penjualan)</p></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card"><p className="mb-2 font-semibold">Penjualan per metode</p>{Object.keys(r.by_method).length === 0 ? <p className="py-6 text-center text-sm text-slate-400">Belum ada penjualan.</p> :
          <div className="divide-y divide-slate-100 text-sm">{(Object.entries(r.by_method) as [PaymentMethod, number][]).map(([m, v]) => <Row key={m} label={METHOD[m]} value={rupiah(v)} />)}</div>}</div>
        <div className="card lg:col-span-2"><p className="mb-2 font-semibold">Penjualan {chart.length > 0 && chart[0].label.includes('-') ? 'bulanan' : 'harian'}</p>
          {chart.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">Belum ada data pada periode ini.</p> :
            <div className="h-56"><ResponsiveContainer><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={11} /><YAxis fontSize={11} tickFormatter={rupiahShort} width={50} />
              <Tooltip formatter={(v: number) => rupiah(v)} /><Bar dataKey="sales" name="Penjualan" fill="#4f46e5" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>}</div>
      </div>
    </div>)
}

function Filters({ f, setF, status, methods = true }: { f: SalesFilter; setF: (f: SalesFilter) => void; status?: boolean; methods?: boolean }) {
  const { data: cats = [] } = useCategories(); const { data: prods = [] } = useProductOptions()
  return (
    <FilterBar>
      {methods && <select className="input w-auto" value={f.method} onChange={e => setF({ ...f, method: e.target.value as '' | PaymentMethod })} aria-label="Metode"><option value="">Semua metode</option>{Object.entries(METHOD).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
      {status && <select className="input w-auto" value={f.status} onChange={e => setF({ ...f, status: e.target.value as '' | SaleStatus })} aria-label="Status"><option value="">Semua status</option>{Object.entries(saleStatus).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>}
      <select className="input w-auto" value={f.categoryId} onChange={e => setF({ ...f, categoryId: e.target.value })} aria-label="Kategori"><option value="">Semua kategori</option>{cats.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}</select>
      <Combobox className="w-52" options={prods.map(p => ({ value: p.id, label: p.product_name }))} value={f.productId} onChange={v => setF({ ...f, productId: v })} emptyLabel="Semua produk" placeholder="Semua produk" />
    </FilterBar>)
}
const noFilter: SalesFilter = { method: '', status: '', categoryId: '', productId: '' }

function SalesTab({ range }: { range: Range }) {
  const { storeId } = useStore(); const [f, setF] = useState<SalesFilter>(noFilter); const [page, setPage] = useState(1)
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['report-sales', storeId, range, f, page], queryFn: () => getSalesReport(storeId, range, f, page, SIZE), placeholderData: prev => prev })
  // Export memuat hingga 500 transaksi terbaru sesuai filter (batas fungsi database)
  const build = async () => {
    const all = await getSalesReport(storeId, range, f, 1, 500)
    return [{ title: 'Transaksi Penjualan', subtitle: sub(range), headers: ['Invoice', 'Waktu', 'Kasir', 'Metode', 'Status', 'Total', 'Refund'],
      rows: all.rows.map(r => [r.invoice_number, dateTimeLabel(r.sale_date), r.cashier ?? '', METHOD[r.payment_method], saleStatus[r.payment_status][0], r.total_amount, r.refunded_amount]) }]
  }
  const cols: Column<SalesReportRow>[] = [
    { key: 'i', header: 'Invoice', cell: r => r.invoice_number }, { key: 'd', header: 'Waktu', cell: r => dateTimeLabel(r.sale_date) }, { key: 'c', header: 'Kasir', cell: r => r.cashier ?? '-' },
    { key: 'm', header: 'Metode', cell: r => METHOD[r.payment_method] }, { key: 's', header: 'Status', cell: r => <StatusBadge map={saleStatus} value={r.payment_status} /> },
    { key: 't', header: 'Total', align: 'right', cell: r => rupiah(r.total_amount) }, { key: 'r', header: 'Refund', align: 'right', cell: r => (r.refunded_amount ? rupiah(r.refunded_amount) : '-') }]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><Filters f={f} setF={x => { setF(x); setPage(1) }} status />
        <ExportMenu filename={`transaksi-${range[0]}_${range[1]}`} disabled={!data?.total} build={build} /></div>
      {data && <p className="text-sm text-slate-500">{number(data.total)} transaksi · total nominal <b className="text-slate-800">{rupiah(data.sum)}</b> (semua status sesuai filter, termasuk pending)</p>}
      <DataTable columns={cols} rows={data?.rows} rowKey={r => r.id} loading={isLoading} error={isError} onRetry={() => void refetch()} page={page} size={SIZE} total={data?.total} onPage={setPage} empty={{ title: 'Tidak ada transaksi', description: 'Ubah periode atau filter.' }} />
    </div>)
}
function ProductsTab({ range }: { range: Range }) {
  const { storeId } = useStore(); const [f, setF] = useState<SalesFilter>(noFilter)
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['report-break', storeId, range, f], queryFn: () => getSalesBreakdown(storeId, range, f) })
  if (isError) return <div className="card"><ErrorState onRetry={() => void refetch()} /></div>
  const d: SalesBreakdown = data ?? { products: [], categories: [] }
  const build = () => [
    { title: 'Per Produk', subtitle: sub(range), headers: ['Produk', 'Kategori', 'Terjual', 'Omzet', 'HPP', 'Laba kotor'], rows: d.products.map(p => [p.name, p.category, p.qty, p.revenue, p.cogs, p.revenue - p.cogs]) },
    { title: 'Per Kategori', subtitle: sub(range), headers: ['Kategori', 'Terjual', 'Omzet', 'HPP', 'Laba kotor'], rows: d.categories.map(c => [c.name, c.qty, c.revenue, c.cogs, c.revenue - c.cogs]) }]
  const pc: Column<SalesBreakdown['products'][number]>[] = [
    { key: 'n', header: 'Produk', cell: p => <b>{p.name}</b> }, { key: 'c', header: 'Kategori', cell: p => p.category }, { key: 'q', header: 'Terjual', align: 'right', cell: p => number(p.qty) },
    { key: 'r', header: 'Omzet', align: 'right', cell: p => rupiah(p.revenue) }, { key: 'h', header: 'HPP', align: 'right', cell: p => rupiah(p.cogs) }, { key: 'l', header: 'Laba kotor', align: 'right', cell: p => <b>{rupiah(p.revenue - p.cogs)}</b> }]
  const cc: Column<SalesBreakdown['categories'][number]>[] = [
    { key: 'n', header: 'Kategori', cell: c => <b>{c.name}</b> }, { key: 'q', header: 'Terjual', align: 'right', cell: c => number(c.qty) }, { key: 'r', header: 'Omzet', align: 'right', cell: c => rupiah(c.revenue) },
    { key: 'h', header: 'HPP', align: 'right', cell: c => rupiah(c.cogs) }, { key: 'l', header: 'Laba kotor', align: 'right', cell: c => <b>{rupiah(c.revenue - c.cogs)}</b> }]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><Filters f={f} setF={setF} /><ExportMenu filename={`penjualan-produk-${range[0]}_${range[1]}`} build={build} disabled={isLoading} /></div>
      <p className="text-xs text-slate-400">Omzet sudah dikurangi retur dan memperhitungkan diskon transaksi secara proporsional.</p>
      <h2 className="font-bold">Per kategori</h2><DataTable columns={cc} rows={d.categories} rowKey={c => c.name} loading={isLoading} empty={{ title: 'Belum ada penjualan' }} />
      <h2 className="font-bold">Per produk</h2><DataTable columns={pc} rows={d.products} rowKey={p => p.name + p.category} loading={isLoading} empty={{ title: 'Belum ada penjualan' }} />
    </div>)
}

function PurchasesTab({ range }: { range: Range }) {
  const { storeId } = useStore(); const { data: sups = [] } = useSupplierOptions(); const { data: prods = [] } = useProductOptions()
  const [f, setF] = useState({ supplierId: '', productId: '', status: '' })
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['report-pur', storeId, range, f], queryFn: () => getPurchaseReport(storeId, range, f) })
  const d: PurchaseReport = data ?? { by_supplier: [], by_product: [], list: [] }
  const build = () => [
    { title: 'Daftar Pembelian', subtitle: sub(range), headers: ['No', 'Tanggal', 'Supplier', 'Total', 'Dibayar', 'Pembayaran', 'Penerimaan'], rows: d.list.map(p => [p.number, p.date, p.supplier, p.total, p.paid, purchasePay[p.payment_status][0], receivingStatus[p.receiving_status][0]]) },
    { title: 'Per Supplier', subtitle: sub(range), headers: ['Supplier', 'Jumlah', 'Total', 'Utang'], rows: d.by_supplier.map(s => [s.name, s.count, s.total, s.unpaid]) },
    { title: 'Per Produk', subtitle: sub(range), headers: ['Produk', 'Jumlah', 'Total'], rows: d.by_product.map(p => [p.name, p.qty, p.total]) }]
  if (isError) return <div className="card"><ErrorState onRetry={() => void refetch()} /></div>
  const lc: Column<PurchaseReport['list'][number]>[] = [
    { key: 'n', header: 'No', cell: p => p.number }, { key: 'd', header: 'Tanggal', cell: p => dateLabel(p.date) }, { key: 's', header: 'Supplier', cell: p => p.supplier },
    { key: 't', header: 'Total', align: 'right', cell: p => rupiah(p.total) }, { key: 'u', header: 'Sisa utang', align: 'right', cell: p => (p.receiving_status === 'received' ? rupiah(p.total - p.paid) : '-') },
    { key: 'p', header: 'Pembayaran', cell: p => <StatusBadge map={purchasePay} value={p.payment_status} /> }, { key: 'r', header: 'Penerimaan', cell: p => <StatusBadge map={receivingStatus} value={p.receiving_status} /> }]
  const sc: Column<PurchaseReport['by_supplier'][number]>[] = [
    { key: 'n', header: 'Supplier', cell: s => <b>{s.name}</b> }, { key: 'c', header: 'Pembelian', align: 'right', cell: s => s.count }, { key: 't', header: 'Total', align: 'right', cell: s => rupiah(s.total) }, { key: 'u', header: 'Utang berjalan', align: 'right', cell: s => rupiah(s.unpaid) }]
  const pc: Column<PurchaseReport['by_product'][number]>[] = [
    { key: 'n', header: 'Produk', cell: p => <b>{p.name}</b> }, { key: 'q', header: 'Jumlah dibeli', align: 'right', cell: p => number(p.qty) }, { key: 't', header: 'Total', align: 'right', cell: p => rupiah(p.total) }]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><FilterBar>
        <select className="input w-auto" value={f.supplierId} onChange={e => setF({ ...f, supplierId: e.target.value })} aria-label="Supplier"><option value="">Semua supplier</option>{sups.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}</select>
        <Combobox className="w-52" options={prods.map(p => ({ value: p.id, label: p.product_name }))} value={f.productId} onChange={v => setF({ ...f, productId: v })} emptyLabel="Semua produk" placeholder="Semua produk" />
        <select className="input w-auto" value={f.status} onChange={e => setF({ ...f, status: e.target.value })} aria-label="Status penerimaan"><option value="">Semua penerimaan</option><option value="draft">Draft</option><option value="received">Diterima</option><option value="cancelled">Dibatalkan</option></select></FilterBar>
        <ExportMenu filename={`pembelian-${range[0]}_${range[1]}`} build={build} disabled={isLoading} /></div>
      <h2 className="font-bold">Daftar pembelian (status penerimaan)</h2><DataTable columns={lc} rows={d.list} rowKey={p => p.number} loading={isLoading} empty={{ title: 'Tidak ada pembelian' }} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2"><h2 className="font-bold">Per supplier</h2><DataTable columns={sc} rows={d.by_supplier} rowKey={s => s.name} loading={isLoading} empty={{ title: 'Belum ada data' }} /></div>
        <div className="space-y-2"><h2 className="font-bold">Per produk</h2><DataTable columns={pc} rows={d.by_product} rowKey={p => p.name} loading={isLoading} empty={{ title: 'Belum ada data' }} /></div></div>
    </div>)
}

export default function Reports() {
  const [period, setPeriod] = useState<PeriodValue>(initialPeriod('month')); const [tab, setTab] = useState<Tab>('summary')
  const range = useMemo(() => period.range, [period])
  const valid = range[0] && range[1] && range[0] <= range[1]
  return (
    <div className="space-y-5">
      <PageHeader title="Laporan" description={`${dateLabel(range[0])} s/d ${dateLabel(range[1])}`} />
      <PeriodPicker value={period} onChange={setPeriod} />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {!valid ? <div className="card"><p className="py-8 text-center text-sm text-slate-500">Pilih rentang tanggal yang valid.</p></div> : <>
        {tab === 'summary' && <Summary range={range} />}{tab === 'sales' && <SalesTab range={range} />}{tab === 'products' && <ProductsTab range={range} />}{tab === 'purchases' && <PurchasesTab range={range} />}</>}
    </div>)
}
