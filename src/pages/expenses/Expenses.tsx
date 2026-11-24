import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Paperclip, Plus, Settings2 } from 'lucide-react'
import { useStore } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDialog } from '../../contexts/DialogContext'
import { useExpenseCategories } from '../../hooks/queries'
import { expenseSchema, type ExpenseForm } from '../../schemas'
import { addExpenseCategory, listExpenses, receiptUrl, renameExpenseCategory, saveExpense, setExpenseCategoryActive, voidExpense, type ExpenseFilters } from '../../services/expenses'
import { validateImage } from '../../services/storage'
import DataTable, { type Column } from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import { Badge, Field, PageHeader } from '../../components/ui/feedback'
import { DatePicker, FilterBar, MoneyInput } from '../../components/ui/inputs'
import { errMsg } from '../../utils/errors'
import { dateLabel, rupiah } from '../../utils/format'
import { iso } from '../../utils/period'
import type { Expense } from '../../types'

const METHOD = { cash: 'Tunai', transfer: 'Transfer', qris: 'QRIS', other: 'Lainnya' }
const SIZE = 15

function ExpenseModal({ item, onClose }: { item: Expense | null; onClose: () => void }) {
  const { storeId } = useStore(); const toast = useToast(); const qc = useQueryClient()
  const { data: cats = [] } = useExpenseCategories()
  const [file, setFile] = useState<File | null>(null); const [fileErr, setFileErr] = useState('')
  const { control, register, handleSubmit, formState: { errors } } = useForm<ExpenseForm>({
    resolver: zodResolver(expenseSchema),
    defaultValues: item ? { expense_date: item.expense_date, category: item.category, description: item.description ?? '', amount: item.amount, payment_method: item.payment_method }
      : { expense_date: iso(new Date()), category: '', description: '', amount: 0, payment_method: 'cash' },
  })
  const save = useMutation({
    mutationFn: (v: ExpenseForm) => saveExpense(storeId, item?.id ?? null, v, file),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['expenses', storeId] }); void qc.invalidateQueries({ queryKey: ['dashboard', storeId] }); toast.success(item ? 'Pengeluaran diperbarui.' : 'Pengeluaran dicatat.'); onClose() },
    onError: e => toast.error(errMsg(e)),
  })
  const active = cats.filter(c => c.is_active || c.category_name === item?.category)
  return (
    <Modal open onClose={onClose} title={item ? `Ubah ${item.expense_number}` : 'Catat pengeluaran'} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Batal</button><button className="btn-primary" form="exp-form" disabled={save.isPending}>{save.isPending ? 'Menyimpan…' : 'Simpan'}</button></>}>
      <form id="exp-form" onSubmit={handleSubmit(v => save.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Tanggal" error={errors.expense_date?.message}><Controller control={control} name="expense_date" render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} />} /></Field>
        <Field label="Kategori" error={errors.category?.message}><select className="input" {...register('category')}><option value="">Pilih kategori</option>{active.map(c => <option key={c.id} value={c.category_name}>{c.category_name}</option>)}</select></Field>
        <Field label="Nominal" error={errors.amount?.message}><Controller control={control} name="amount" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} invalid={!!errors.amount} />} /></Field>
        <Field label="Metode pembayaran"><select className="input" {...register('payment_method')}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Deskripsi" className="sm:col-span-2"><input className="input" {...register('description')} /></Field>
        <Field label={item?.receipt_path ? 'Ganti bukti transaksi (PNG/JPG, maks 2 MB)' : 'Bukti transaksi (PNG/JPG, maks 2 MB)'} error={fileErr} className="sm:col-span-2">
          <input type="file" accept="image/png,image/jpeg" className="block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-semibold file:text-brand-700"
            onChange={e => { const f = e.target.files?.[0]; if (!f) return setFile(null); const m = validateImage(f); setFileErr(m ?? ''); setFile(m ? null : f) }} /></Field>
      </form>
    </Modal>)
}

function DetailModal({ e, onClose }: { e: Expense; onClose: () => void }) {
  const { data: url } = useQuery({ queryKey: ['receipt', e.receipt_path], enabled: !!e.receipt_path, queryFn: () => receiptUrl(e.receipt_path) })
  const rows: [string, string][] = [['Nomor', e.expense_number], ['Tanggal', dateLabel(e.expense_date)], ['Kategori', e.category], ['Nominal', rupiah(e.amount)], ['Metode', METHOD[e.payment_method]], ['Deskripsi', e.description ?? '-'], ['Status', e.status === 'voided' ? 'Dibatalkan' : 'Aktif']]
  return (
    <Modal open onClose={onClose} title="Detail pengeluaran">
      <dl className="grid grid-cols-2 gap-3 text-sm">{rows.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-semibold">{v}</dd></div>)}</dl>
      {e.receipt_path && <div className="mt-4"><p className="mb-1 text-xs text-slate-500">Bukti transaksi</p>{url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Bukti transaksi" className="max-h-72 rounded-lg border border-slate-200" /></a> : <p className="text-sm text-slate-400">Memuat…</p>}</div>}
    </Modal>)
}

function CategoryManager({ onClose }: { onClose: () => void }) {
  const { storeId } = useStore(); const toast = useToast(); const dialog = useDialog(); const qc = useQueryClient()
  const { data: cats = [] } = useExpenseCategories(); const [name, setName] = useState('')
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['expense-categories', storeId] }) }
  const run = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); refresh(); if (ok) toast.success(ok) } catch (e) { toast.error(errMsg(e)) } }
  const rename = async (id: string, cur: string) => { const n = await dialog.prompt({ title: 'Ubah nama kategori', label: 'Nama kategori', defaultValue: cur }); if (n && n !== cur) await run(() => renameExpenseCategory(id, n), 'Nama diperbarui.') }
  return (
    <Modal open onClose={onClose} title="Kelola kategori pengeluaran">
      <form className="mb-4 flex gap-2" onSubmit={e => { e.preventDefault(); if (name.trim()) void run(() => addExpenseCategory(storeId, name), 'Kategori ditambahkan.').then(() => setName('')) }}>
        <input className="input" placeholder="Kategori baru" value={name} onChange={e => setName(e.target.value)} /><button className="btn-primary">Tambah</button></form>
      <ul className="divide-y divide-slate-100">{cats.map(c => (
        <li key={c.id} className="flex items-center justify-between py-2.5 text-sm"><span className={c.is_active ? '' : 'text-slate-400 line-through'}>{c.category_name}</span>
          <span className="space-x-3"><button className="link" onClick={() => void rename(c.id, c.category_name)}>Ubah</button><button className="text-slate-500 hover:underline" onClick={() => void run(() => setExpenseCategoryActive(c.id, !c.is_active))}>{c.is_active ? 'Sembunyikan' : 'Tampilkan'}</button></span></li>))}</ul>
      <p className="mt-3 text-xs text-slate-400">Kategori yang disembunyikan tidak muncul di form baru, tetapi pengeluaran lama tetap utuh.</p>
    </Modal>)
}

export default function Expenses() {
  const { storeId } = useStore(); const toast = useToast(); const dialog = useDialog(); const qc = useQueryClient()
  const { data: cats = [] } = useExpenseCategories()
  const [f, setF] = useState<Omit<ExpenseFilters, 'page' | 'size'>>({ from: '', to: '', category: '', status: '' }); const [page, setPage] = useState(1)
  const [edit, setEdit] = useState<Expense | 'new' | null>(null); const [view, setView] = useState<Expense | null>(null); const [manage, setManage] = useState(false)
  const filters = { ...f, page, size: SIZE }
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['expenses', storeId, filters], queryFn: () => listExpenses(storeId, filters), placeholderData: prev => prev })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF(p => ({ ...p, [k]: v })); setPage(1) }
  const voidIt = async (e: Expense) => {
    const reason = await dialog.prompt({ title: `Batalkan ${e.expense_number}?`, message: 'Pengeluaran yang dibatalkan tidak dihitung di laporan.', label: 'Alasan pembatalan', confirmText: 'Batalkan pengeluaran', danger: true })
    if (!reason) return
    try { await voidExpense(e.id, reason); void qc.invalidateQueries({ queryKey: ['expenses', storeId] }); void qc.invalidateQueries({ queryKey: ['dashboard', storeId] }); toast.success('Pengeluaran dibatalkan.') } catch (err) { toast.error(errMsg(err)) }
  }
  const cols: Column<Expense>[] = [
    { key: 'n', header: 'No', cell: e => <button className="link" onClick={() => setView(e)}>{e.expense_number}</button> },
    { key: 'd', header: 'Tanggal', cell: e => dateLabel(e.expense_date) }, { key: 'c', header: 'Kategori', cell: e => e.category },
    { key: 'x', header: 'Deskripsi', className: 'max-w-xs truncate', cell: e => <span className="inline-flex items-center gap-1">{e.receipt_path && <Paperclip size={13} className="text-slate-400" aria-label="Ada bukti" />}{e.description}</span> },
    { key: 'm', header: 'Metode', cell: e => METHOD[e.payment_method] }, { key: 'a', header: 'Nominal', align: 'right', cell: e => <b>{rupiah(e.amount)}</b> },
    { key: 's', header: 'Status', cell: e => <Badge tone={e.status === 'voided' ? 'slate' : 'green'}>{e.status === 'voided' ? 'Dibatalkan' : 'Aktif'}</Badge> },
    { key: 'o', header: '', align: 'right', cell: e => e.status === 'active' && <span className="space-x-3 whitespace-nowrap"><button className="link" onClick={() => setEdit(e)}>Ubah</button><button className="text-red-600 hover:underline" onClick={() => void voidIt(e)}>Batalkan</button></span> },
  ]
  return (
    <div className="space-y-5">
      {edit && <ExpenseModal item={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}{view && <DetailModal e={view} onClose={() => setView(null)} />}{manage && <CategoryManager onClose={() => setManage(false)} />}
      <PageHeader title="Pengeluaran Operasional" description="Pembelian barang dagangan dicatat di menu Pembelian, bukan di sini." actions={<>
        <button className="btn-secondary" onClick={() => setManage(true)}><Settings2 size={16} />Kategori</button><button className="btn-primary" onClick={() => setEdit('new')}><Plus size={16} />Catat pengeluaran</button></>} />
      <FilterBar>
        <DatePicker className="w-40" value={f.from} onChange={v => set('from', v)} placeholder="Dari tanggal" clearable max={f.to || undefined} />
        <DatePicker className="w-40" value={f.to} onChange={v => set('to', v)} placeholder="Sampai tanggal" clearable min={f.from || undefined} />
        <select className="input w-auto" value={f.category} onChange={e => set('category', e.target.value)} aria-label="Filter kategori"><option value="">Semua kategori</option>{cats.map(c => <option key={c.id} value={c.category_name}>{c.category_name}</option>)}</select>
        <select className="input w-auto" value={f.status} onChange={e => set('status', e.target.value as ExpenseFilters['status'])} aria-label="Filter status"><option value="">Semua status</option><option value="active">Aktif</option><option value="voided">Dibatalkan</option></select>
        {data && <p className="ml-auto text-sm text-slate-500">Total aktif sesuai filter: <b className="text-slate-800">{rupiah(data.sum)}</b></p>}
      </FilterBar>
      <DataTable columns={cols} rows={data?.rows} rowKey={e => e.id} loading={isLoading} error={isError} onRetry={() => void refetch()} page={page} size={SIZE} total={data?.total} onPage={setPage}
        rowClass={e => (e.status === 'voided' ? 'text-slate-400' : '')} empty={{ title: 'Belum ada pengeluaran', description: 'Catat biaya seperti listrik, air, dan kemasan.', action: <button className="btn-primary" onClick={() => setEdit('new')}>Catat pengeluaran</button> }} />
    </div>)
}
