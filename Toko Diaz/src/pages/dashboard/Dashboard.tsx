import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Banknote, Clock, Package, PiggyBank, Receipt, ShoppingCart, TrendingUp, Wallet } from 'lucide-react'
import { useStore } from '../../contexts/AuthContext'
import { getDashboard } from '../../services/dashboard'
import { EmptyState, ErrorState, PageHeader, Skeleton, StatCard, StatusBadge, saleStatus, receivingStatus } from '../../components/ui/feedback'
import { dateLabel, dateTimeLabel, monthLabel, rupiah, rupiahShort } from '../../utils/format'
import type { Dashboard as DashboardData } from '../../types'

const C = { indigo: '#4f46e5', green: '#16a34a', amber: '#f59e0b', red: '#dc2626', slate: '#94a3b8' }
const tip = (v: number) => rupiah(v)

function ChartCard({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="card"><p className="mb-3 font-semibold">{title}</p>
      {empty ? <EmptyState title="Belum ada data" description="Grafik muncul setelah ada transaksi." /> : <div className="h-64">{children}</div>}</div>)
}

function Charts({ d }: { d: DashboardData }) {
  const series = d.series.map(s => ({ ...s, label: monthLabel(s.month) }))
  const hasAny = series.some(s => s.sales || s.purchases || s.expenses)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Penjualan bulanan (12 bulan)" empty={!hasAny}>
        <ResponsiveContainer><BarChart data={series}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={12} /><YAxis fontSize={12} tickFormatter={rupiahShort} width={52} />
          <Tooltip formatter={tip} /><Bar dataKey="sales" name="Penjualan" fill={C.indigo} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Penjualan vs pembelian" empty={!hasAny}>
        <ResponsiveContainer><BarChart data={series}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={12} /><YAxis fontSize={12} tickFormatter={rupiahShort} width={52} />
          <Tooltip formatter={tip} /><Legend /><Bar dataKey="sales" name="Penjualan" fill={C.indigo} radius={[4, 4, 0, 0]} /><Bar dataKey="purchases" name="Pembelian" fill={C.amber} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Pengeluaran per kategori (bulan ini)" empty={d.expense_by_category.length === 0}>
        <ResponsiveContainer><BarChart data={d.expense_by_category} layout="vertical" margin={{ left: 24 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" fontSize={12} tickFormatter={rupiahShort} />
          <YAxis type="category" dataKey="name" fontSize={12} width={120} /><Tooltip formatter={tip} /><Bar dataKey="total" name="Pengeluaran" fill={C.red} radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Tren laba kotor vs laba bersih" empty={!hasAny}>
        <ResponsiveContainer><LineChart data={series}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={12} /><YAxis fontSize={12} tickFormatter={rupiahShort} width={52} />
          <Tooltip formatter={tip} /><Legend /><Line type="monotone" dataKey="gross_profit" name="Laba kotor" stroke={C.green} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="net_profit" name="Laba bersih" stroke={C.indigo} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer>
      </ChartCard>
    </div>)
}

function ListCard({ title, to, children }: { title: string; to?: string; children: React.ReactNode }) {
  return (
    <div className="card p-0"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><p className="font-semibold">{title}</p>{to && <Link to={to} className="link text-xs">Lihat semua</Link>}</div>{children}</div>)
}
const none = <p className="px-5 py-8 text-center text-sm text-slate-400">Belum ada data.</p>

export default function Dashboard() {
  const { storeId } = useStore()
  const { data: d, isLoading, isError, refetch } = useQuery({ queryKey: ['dashboard', storeId], queryFn: () => getDashboard(storeId) })
  if (isError) return <div className="card"><ErrorState onRetry={() => void refetch()} /></div>
  const loading = isLoading || !d
  const cards = d ? [
    { label: 'Penjualan bulan ini', value: rupiah(d.month.sales), icon: <Banknote size={20} />, tone: 'indigo' as const, hint: `Hari ini ${rupiah(d.today.sales)} · ${d.today.transactions} transaksi` },
    { label: 'Pembelian bulan ini', value: rupiah(d.month.purchases), icon: <ShoppingCart size={20} />, tone: 'amber' as const, hint: `Utang supplier ${rupiah(d.payables)}` },
    { label: 'Pengeluaran bulan ini', value: rupiah(d.month.expenses), icon: <Wallet size={20} />, tone: 'red' as const },
    { label: 'Estimasi laba bersih', value: rupiah(d.month.net_profit), icon: <PiggyBank size={20} />, tone: d.month.net_profit >= 0 ? 'green' as const : 'red' as const, hint: `Laba kotor ${rupiah(d.month.gross_profit)}` },
  ] : []
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Ringkasan kondisi toko bulan ini." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? [0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24" />) : cards.map(c => <StatCard key={c.label} {...c} />)}
      </div>
      {d && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Link to="/products" className="card flex items-center gap-3 py-3 hover:border-brand-300"><Package className="text-brand-600" size={18} /><span className="text-sm">Produk aktif <b>{d.active_products}</b></span></Link>
          <Link to="/products?stock=low" className="card flex items-center gap-3 py-3 hover:border-amber-300"><AlertTriangle className={d.low_stock ? 'text-amber-500' : 'text-slate-400'} size={18} /><span className="text-sm">Stok menipis <b>{d.low_stock}</b></span></Link>
          <Link to="/sales?status=pending" className="card flex items-center gap-3 py-3 hover:border-brand-300"><Clock className={d.pending_sales ? 'text-amber-500' : 'text-slate-400'} size={18} /><span className="text-sm">Transaksi pending <b>{d.pending_sales}</b></span></Link>
        </div>)}
      {loading ? <Skeleton className="h-72" /> : <Charts d={d} />}
      {d && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ListCard title="Transaksi terbaru" to="/sales">
            {d.recent_sales.length === 0 ? none : <ul className="divide-y divide-slate-100">{d.recent_sales.map(s => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"><div className="min-w-0"><p className="truncate font-medium">{s.invoice_number}</p><p className="text-xs text-slate-400">{dateTimeLabel(s.sale_date)}</p></div>
                <div className="flex items-center gap-3"><StatusBadge map={saleStatus} value={s.payment_status} /><span className="font-semibold">{rupiah(s.total_amount)}</span></div></li>))}</ul>}
          </ListCard>
          <ListCard title="Produk terlaris bulan ini" to="/reports">
            {d.top_products.length === 0 ? none : <ul className="divide-y divide-slate-100">{d.top_products.map((p, i) => (
              <li key={p.name} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"><span className="flex min-w-0 items-center gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span><span className="truncate">{p.name}</span></span>
                <span className="shrink-0 text-right"><b>{p.qty}</b> terjual<span className="block text-xs text-slate-400">{rupiah(p.revenue)}</span></span></li>))}</ul>}
          </ListCard>
          <ListCard title="Stok terendah" to="/products?stock=low">
            {d.lowest_stock.length === 0 ? none : <ul className="divide-y divide-slate-100">{d.lowest_stock.map(p => (
              <li key={p.name} className="flex items-center justify-between px-5 py-2.5 text-sm"><span className="truncate pr-3">{p.name}</span>
                <span className={`shrink-0 font-semibold ${p.stock <= 0 ? 'text-red-600' : p.stock <= p.minimum_stock ? 'text-amber-600' : ''}`}>{p.stock} {p.unit}<span className="ml-1 text-xs font-normal text-slate-400">/ min {p.minimum_stock}</span></span></li>))}</ul>}
          </ListCard>
          <ListCard title="Aktivitas pembelian terbaru" to="/purchases">
            {d.recent_purchases.length === 0 ? none : <ul className="divide-y divide-slate-100">{d.recent_purchases.map(p => (
              <li key={p.id}><Link to={`/purchases/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-slate-50"><div className="min-w-0"><p className="truncate font-medium">{p.purchase_number}</p><p className="truncate text-xs text-slate-400">{p.supplier_name ?? 'Tanpa supplier'} · {dateLabel(p.purchase_date)}</p></div>
                <div className="flex items-center gap-3"><StatusBadge map={receivingStatus} value={p.receiving_status} /><span className="font-semibold">{rupiah(p.total_amount)}</span></div></Link></li>))}</ul>}
          </ListCard>
        </div>)}
      <p className="flex items-center gap-2 text-xs text-slate-400"><TrendingUp size={14} /><Receipt size={14} />Angka bulan ini dihitung dari transaksi lunas, dikurangi refund; pembelian bukan beban, HPP dihitung saat barang terjual.</p>
    </div>)
}
