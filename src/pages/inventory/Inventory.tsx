import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStore } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDialog } from '../../contexts/DialogContext'
import { useProductOptions } from '../../hooks/queries'
import { adjustSchema, type AdjustForm } from '../../schemas'
import { adjustStock, createOpname, getOpnameItems, listAllMovements, listOpnames, type MovementFilters } from '../../services/inventory'
import { getLowStock } from '../../services/dashboard'
import DataTable, { type Column } from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import { Field, PageHeader, Tabs } from '../../components/ui/feedback'
import { Combobox, DatePicker, FilterBar, MoneyInput, SearchInput } from '../../components/ui/inputs'
import { errMsg } from '../../utils/errors'
import { dateTimeLabel, number } from '../../utils/format'
import type { StockMovement, StockOpname } from '../../types'
import { movementLabel } from './labels'

const TABS = [['adjust', 'Penyesuaian'], ['opname', 'Stok opname'], ['history', 'Riwayat']] as const
type Tab = (typeof TABS)[number][0]
const SIZE = 15

function AdjustPanel() {
  const { storeId } = useStore(); const toast = useToast(); const qc = useQueryClient()
  const { data: products = [] } = useProductOptions()
  const { control, register, handleSubmit, watch, reset, formState: { errors } } = useForm<AdjustForm>({
    resolver: zodResolver(adjustSchema), defaultValues: { product_id: '', type: 'damage_out', direction: 'out', quantity: 1, reason: '', unit_cost: 0 } })
  const type = watch('type'); const dir = watch('direction'); const pid = watch('product_id')
  const product = products.find(p => p.id === pid)
  const save = useMutation({
    mutationFn: (v: AdjustForm) => {
      const out = v.type !== 'adjustment' || v.direction === 'out'
      return adjustStock(v.product_id, out ? -v.quantity : v.quantity, v.reason, v.type, !out && v.unit_cost ? v.unit_cost : undefined)
    },
    onSuccess: () => { for (const k of ['products', 'product-options', 'moves', 'low-stock']) void qc.invalidateQueries({ queryKey: [k] }); toast.success('Stok diperbarui.'); reset({ product_id: '', type: 'damage_out', direction: 'out', quantity: 1, reason: '', unit_cost: 0 }) },
    onError: e => toast.error(errMsg(e)),
  })
  void storeId
  return (
    <form onSubmit={handleSubmit(v => save.mutate(v))} className="card grid gap-4 sm:grid-cols-2 lg:grid-cols-3" noValidate>
      <Field label="Produk" error={errors.product_id?.message} className="lg:col-span-2"><Controller control={control} name="product_id" render={({ field }) =>
        <Combobox options={products.map(p => ({ value: p.id, label: p.product_name, hint: `stok ${p.stock}` }))} value={field.value} onChange={field.onChange} invalid={!!errors.product_id} placeholder="Pilih produk" />} /></Field>
      <Field label="Jenis"><select className="input" {...register('type')}><option value="damage_out">Barang rusak (keluar)</option><option value="lost_out">Barang hilang (keluar)</option><option value="adjustment">Koreksi / stok awal</option></select></Field>
      {type === 'adjustment' && <Field label="Arah"><select className="input" {...register('direction')}><option value="in">Stok masuk (+)</option><option value="out">Stok keluar (−)</option></select></Field>}
      <Field label={`Jumlah${product ? ` (${product.unit})` : ''}`} error={errors.quantity?.message}><input className="input" type="number" min={1} inputMode="numeric" {...register('quantity', { valueAsNumber: true })} /></Field>
      {type === 'adjustment' && dir === 'in' && <Field label="HPP per satuan (opsional)" hint="Isi bila stok masuk bernilai berbeda dari HPP saat ini."><Controller control={control} name="unit_cost" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} />} /></Field>}
      <Field label="Alasan" error={errors.reason?.message} className="sm:col-span-2 lg:col-span-1"><input className="input" placeholder="Mis. pecah saat pengiriman" {...register('reason')} /></Field>
      <div className="flex items-end"><button className="btn-primary w-full" disabled={save.isPending}>{save.isPending ? 'Menyimpan…' : 'Simpan penyesuaian'}</button></div>
    </form>)
}

function OpnameDetail({ o, onClose }: { o: StockOpname; onClose: () => void }) {
  const { data = [], isLoading } = useQuery({ queryKey: ['opname-items', o.id], queryFn: () => getOpnameItems(o.id) })
  return (
    <Modal open onClose={onClose} title={`Opname ${o.opname_number}`} size="lg">
      {o.notes && <p className="mb-3 text-sm text-slate-500">{o.notes}</p>}
      {isLoading ? <p className="py-6 text-center text-sm text-slate-400">Memuat…</p> : (
        <table className="w-full text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 text-left">Produk</th><th className="py-2 text-right">Sistem</th><th className="py-2 text-right">Hitung</th><th className="py-2 text-right">Selisih</th></tr></thead>
          <tbody>{data.map(i => <tr key={i.id} className="border-t border-slate-100"><td className="py-2">{i.products?.product_name}</td><td className="py-2 text-right">{i.system_qty}</td><td className="py-2 text-right">{i.counted_qty}</td>
            <td className={`py-2 text-right font-semibold ${i.difference < 0 ? 'text-red-600' : i.difference > 0 ? 'text-green-600' : 'text-slate-400'}`}>{i.difference > 0 ? '+' : ''}{i.difference}</td></tr>)}</tbody></table>)}
    </Modal>)
}

function OpnamePanel() {
  const { storeId } = useStore(); const toast = useToast(); const dialog = useDialog(); const qc = useQueryClient()
  const { data: products = [], isLoading } = useProductOptions()
  const [counts, setCounts] = useState<Record<string, string>>({}); const [notes, setNotes] = useState(''); const [q, setQ] = useState(''); const [page, setPage] = useState(1); const [view, setView] = useState<StockOpname | null>(null)
  const hist = useQuery({ queryKey: ['opnames', storeId, page], queryFn: () => listOpnames(storeId, page, 8), placeholderData: prev => prev })
  const rows = useMemo(() => products.filter(p => (p.product_name + p.product_code).toLowerCase().includes(q.toLowerCase())), [products, q])
  const changed = products.filter(p => counts[p.id] !== undefined && counts[p.id] !== '' && Number(counts[p.id]) !== p.stock)
  const entered = products.filter(p => counts[p.id] !== undefined && counts[p.id] !== '')
  const save = useMutation({
    mutationFn: () => createOpname(storeId, entered.map(p => ({ product_id: p.id, counted: Number(counts[p.id]) })), notes),
    onSuccess: () => { for (const k of ['products', 'product-options', 'moves', 'opnames', 'low-stock']) void qc.invalidateQueries({ queryKey: [k] }); toast.success('Stok opname disimpan.'); setCounts({}); setNotes('') },
    onError: e => toast.error(errMsg(e)),
  })
  const submit = async () => {
    if (!entered.length) return toast.error('Isi minimal satu hitungan fisik.')
    if (entered.some(p => Number(counts[p.id]) < 0 || !Number.isInteger(Number(counts[p.id])))) return toast.error('Hitungan harus bilangan bulat tidak negatif.')
    if (await dialog.confirm({ title: 'Simpan stok opname?', message: `${entered.length} produk dihitung, ${changed.length} berselisih. Stok sistem akan disamakan dengan hitungan fisik.`, confirmText: 'Simpan opname' })) save.mutate()
  }
  const cols: Column<StockOpname>[] = [
    { key: 'n', header: 'No. opname', cell: o => <button className="link" onClick={() => setView(o)}>{o.opname_number}</button> },
    { key: 't', header: 'Waktu', cell: o => dateTimeLabel(o.created_at) }, { key: 'c', header: 'Produk dihitung', align: 'right', cell: o => o.stock_opname_items.length }, { key: 'x', header: 'Catatan', cell: o => o.notes ?? '' }]
  return (
    <div className="space-y-5">
      {view && <OpnameDetail o={view} onClose={() => setView(null)} />}
      <div className="card space-y-4">
        <p className="text-sm text-slate-500">Hitung stok fisik di rak, isi kolom <b>Hitungan fisik</b>, lalu simpan. Selisih otomatis menjadi pergerakan stok bertipe opname. Kolom yang dikosongkan dilewati.</p>
        <div className="flex flex-wrap gap-3"><SearchInput className="w-full sm:w-72" value={q} onChange={setQ} placeholder="Cari produk" /><input className="input w-full sm:flex-1" placeholder="Catatan opname (opsional)" value={notes} onChange={e => setNotes(e.target.value)} /></div>
        <div className="max-h-96 overflow-auto rounded-lg border border-slate-200"><table className="w-full min-w-[480px] text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2 text-left">Produk</th><th className="px-4 py-2 text-right">Stok sistem</th><th className="px-4 py-2 text-right">Hitungan fisik</th><th className="px-4 py-2 text-right">Selisih</th></tr></thead>
          <tbody>{isLoading ? <tr><td colSpan={4} className="p-6 text-center text-slate-400">Memuat…</td></tr> : rows.map(p => { const c = counts[p.id]; const diff = c === undefined || c === '' ? null : Number(c) - p.stock
            return <tr key={p.id} className="border-t border-slate-100"><td className="px-4 py-2">{p.product_name}<span className="ml-2 font-mono text-xs text-slate-400">{p.product_code}</span></td><td className="px-4 py-2 text-right">{number(p.stock)} {p.unit}</td>
              <td className="px-4 py-2 text-right"><input type="number" min={0} inputMode="numeric" aria-label={`Hitungan fisik ${p.product_name}`} className="input ml-auto w-24 py-1.5 text-right" value={c ?? ''} onChange={e => setCounts(s => ({ ...s, [p.id]: e.target.value }))} /></td>
              <td className={`px-4 py-2 text-right font-semibold ${diff == null ? 'text-slate-300' : diff < 0 ? 'text-red-600' : diff > 0 ? 'text-green-600' : 'text-slate-400'}`}>{diff == null ? '-' : `${diff > 0 ? '+' : ''}${diff}`}</td></tr> })}</tbody></table></div>
        <div className="flex items-center justify-between"><span className="text-sm text-slate-500">{entered.length} dihitung · {changed.length} berselisih</span><button className="btn-primary" disabled={save.isPending || !entered.length} onClick={() => void submit()}>{save.isPending ? 'Menyimpan…' : 'Simpan opname'}</button></div>
      </div>
      <h2 className="font-bold">Riwayat opname</h2>
      <DataTable columns={cols} rows={hist.data?.rows} rowKey={o => o.id} loading={hist.isLoading} error={hist.isError} onRetry={() => void hist.refetch()} page={page} size={8} total={hist.data?.total} onPage={setPage} empty={{ title: 'Belum ada stok opname' }} />
    </div>)
}

function HistoryPanel() {
  const { storeId } = useStore()
  const { data: products = [] } = useProductOptions()
  const [f, setF] = useState<Omit<MovementFilters, 'page' | 'size'>>({ productId: '', type: '', from: '', to: '' }); const [page, setPage] = useState(1)
  const filters = { ...f, page, size: SIZE }
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['moves', storeId, filters], queryFn: () => listAllMovements(storeId, filters), placeholderData: prev => prev })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF(p => ({ ...p, [k]: v })); setPage(1) }
  const cols: Column<StockMovement>[] = [
    { key: 't', header: 'Waktu', cell: m => dateTimeLabel(m.created_at) }, { key: 'p', header: 'Produk', cell: m => <b>{m.products?.product_name}</b> },
    { key: 'y', header: 'Jenis', cell: m => movementLabel[m.movement_type] ?? m.movement_type },
    { key: 'q', header: 'Jumlah', align: 'right', cell: m => <b className={m.quantity < 0 ? 'text-red-600' : 'text-green-600'}>{m.quantity > 0 ? '+' : ''}{m.quantity}</b> },
    { key: 'b', header: 'Sebelum → sesudah', align: 'right', cell: m => `${m.stock_before} → ${m.stock_after}` }, { key: 'n', header: 'Catatan', cell: m => m.notes ?? '' }]
  return (
    <div className="space-y-4">
      <FilterBar>
        <Combobox className="w-56" options={products.map(p => ({ value: p.id, label: p.product_name }))} value={f.productId} onChange={v => set('productId', v)} emptyLabel="Semua produk" placeholder="Semua produk" />
        <select className="input w-auto" value={f.type} onChange={e => set('type', e.target.value as MovementFilters['type'])} aria-label="Filter jenis"><option value="">Semua jenis</option>{Object.entries(movementLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <DatePicker className="w-40" value={f.from} onChange={v => set('from', v)} placeholder="Dari tanggal" clearable max={f.to || undefined} />
        <DatePicker className="w-40" value={f.to} onChange={v => set('to', v)} placeholder="Sampai tanggal" clearable min={f.from || undefined} />
      </FilterBar>
      <DataTable columns={cols} rows={data?.rows} rowKey={m => m.id} loading={isLoading} error={isError} onRetry={() => void refetch()} page={page} size={SIZE} total={data?.total} onPage={setPage} empty={{ title: 'Belum ada pergerakan stok' }} />
    </div>)
}

export default function Inventory() {
  const { storeId } = useStore()
  const [tab, setTab] = useState<Tab>('adjust')
  const { data: low } = useQuery({ queryKey: ['low-stock', storeId, 'inv'], queryFn: () => getLowStock(storeId, 6) })
  return (
    <div className="space-y-5">
      <PageHeader title="Manajemen Stok" description="Setiap perubahan stok tercatat di riwayat." />
      {!!low?.count && (
        <div className="flex items-start gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status"><AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p><b>{low.count} produk</b> menipis atau habis: {low.items.map(i => `${i.name} (${i.stock})`).join(', ')}{low.count > low.items.length ? '…' : ''}. <Link to="/products?stock=low" className="font-semibold underline">Lihat semua</Link></p></div>)}
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'adjust' && <AdjustPanel />}{tab === 'opname' && <OpnamePanel />}{tab === 'history' && <HistoryPanel />}
    </div>)
}
