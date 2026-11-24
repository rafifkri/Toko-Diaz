import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStore } from '../../contexts/AuthContext'
import { listAuditLogs, type AuditFilters } from '../../services/audit'
import DataTable, { type Column } from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import { Badge, PageHeader } from '../../components/ui/feedback'
import { DatePicker, FilterBar } from '../../components/ui/inputs'
import { dateTimeLabel } from '../../utils/format'
import type { AuditLog as Log } from '../../types'

export const ACTION_LABEL: Record<string, string> = {
  create_sale: 'Penjualan dibuat', confirm_payment: 'Pembayaran dikonfirmasi', cancel_sale: 'Transaksi dibatalkan', fail_sale: 'Pembayaran gagal', refund_sale: 'Refund penuh', partial_refund_sale: 'Refund sebagian',
  create_purchase: 'Pembelian dibuat', update_purchase: 'Draft pembelian diubah', receive_purchase: 'Pembelian diterima', cancel_purchase: 'Pembelian dibatalkan', pay_purchase: 'Pembayaran utang supplier',
  adjust_stock: 'Penyesuaian stok', stock_opname: 'Stok opname', add_expense: 'Pengeluaran dicatat', update_expense: 'Pengeluaran diubah', void_expense: 'Pengeluaran dibatalkan',
  insert_products: 'Produk ditambahkan', update_products: 'Produk diubah', insert_store_payment_settings: 'Pengaturan pembayaran dibuat', update_store_payment_settings: 'Pengaturan pembayaran/QRIS diubah',
  delete_store_payment_settings: 'Pengaturan pembayaran dihapus', insert_store_users: 'Pengguna ditambahkan', update_store_users: 'Pengguna diubah', delete_store_users: 'Pengguna dihapus', update_stores: 'Profil toko diubah',
}
const TABLES = [['sales', 'Penjualan'], ['purchases', 'Pembelian'], ['products', 'Produk'], ['expenses', 'Pengeluaran'], ['store_users', 'Pengguna'], ['store_payment_settings', 'Pembayaran'], ['stores', 'Toko']]
const SIZE = 20
const TONE = (a: string) => (/refund|void|cancel|fail|delete/.test(a) ? 'red' : /update|adjust|opname/.test(a) ? 'amber' : /create|insert|add|receive|confirm|pay/.test(a) ? 'green' : 'slate') as 'red' | 'amber' | 'green' | 'slate'
const fmt = (v: unknown) => (v === null || v === undefined ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v))
const HIDE = new Set(['created_at', 'updated_at', 'id', 'store_id', 'image_url'])

function Diff({ l }: { l: Log }) {
  const o = l.old_data ?? {}; const n = l.new_data ?? {}
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter(k => !HIDE.has(k) && (l.old_data && l.new_data ? fmt(o[k]) !== fmt(n[k]) : true))
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-500">{dateTimeLabel(l.created_at)} · {l.profiles?.full_name ?? l.profiles?.email ?? 'Sistem'}</p>
      {keys.length === 0 ? <p className="text-slate-400">Tidak ada rincian.</p> : (
        <table className="w-full"><thead className="text-xs uppercase text-slate-500"><tr><th className="py-1 text-left">Kolom</th><th className="py-1 text-left">Sebelum</th><th className="py-1 text-left">Sesudah</th></tr></thead>
          <tbody>{keys.map(k => <tr key={k} className="border-t border-slate-100 align-top"><td className="py-1.5 pr-3 font-mono text-xs">{k}</td><td className="py-1.5 pr-3 text-red-700">{fmt(o[k])}</td><td className="py-1.5 text-green-700">{fmt(n[k])}</td></tr>)}</tbody></table>)}
    </div>)
}

export default function AuditLog() {
  const { storeId } = useStore()
  const [f, setF] = useState<Omit<AuditFilters, 'page' | 'size'>>({ action: '', table: '', from: '', to: '' }); const [page, setPage] = useState(1); const [view, setView] = useState<Log | null>(null)
  const filters = { ...f, page, size: SIZE }
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['audit', storeId, filters], queryFn: () => listAuditLogs(storeId, filters), placeholderData: prev => prev })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF(p => ({ ...p, [k]: v })); setPage(1) }
  const cols: Column<Log>[] = [
    { key: 't', header: 'Waktu', cell: l => dateTimeLabel(l.created_at) }, { key: 'u', header: 'Pengguna', cell: l => l.profiles?.full_name ?? l.profiles?.email ?? <span className="text-slate-400">Sistem</span> },
    { key: 'a', header: 'Aksi', cell: l => <Badge tone={TONE(l.action)}>{ACTION_LABEL[l.action] ?? l.action}</Badge> },
    { key: 'd', header: '', align: 'right', cell: l => <button className="link" onClick={() => setView(l)}>Rincian</button> },
  ]
  return (
    <div className="space-y-5">
      {view && <Modal open onClose={() => setView(null)} title={ACTION_LABEL[view.action] ?? view.action} size="lg"><Diff l={view} /></Modal>}
      <PageHeader title="Log Aktivitas" description="Jejak perubahan penting: transaksi, stok, harga, pembayaran, dan pengguna. Log tidak dapat diubah." />
      <FilterBar>
        <select className="input w-auto" value={f.table} onChange={e => set('table', e.target.value)} aria-label="Filter modul"><option value="">Semua modul</option>{TABLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="input w-auto" value={f.action} onChange={e => set('action', e.target.value)} aria-label="Filter aksi"><option value="">Semua aksi</option>{Object.entries(ACTION_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <DatePicker className="w-40" value={f.from} onChange={v => set('from', v)} placeholder="Dari tanggal" clearable max={f.to || undefined} />
        <DatePicker className="w-40" value={f.to} onChange={v => set('to', v)} placeholder="Sampai tanggal" clearable min={f.from || undefined} />
      </FilterBar>
      <DataTable columns={cols} rows={data?.rows} rowKey={l => l.id} loading={isLoading} error={isError} onRetry={() => void refetch()} page={page} size={SIZE} total={data?.total} onPage={setPage} empty={{ title: 'Belum ada aktivitas tercatat' }} />
    </div>)
}
