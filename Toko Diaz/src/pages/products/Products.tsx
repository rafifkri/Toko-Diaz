import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Plus, Upload } from 'lucide-react'
import { useStore } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDialog } from '../../contexts/DialogContext'
import { useDebounced } from '../../hooks'
import { useCategories } from '../../hooks/queries'
import { importProducts, listAllProducts, listProducts, setProductActive, type ProductFilters } from '../../services/products'
import DataTable, { type Column } from '../../components/ui/DataTable'
import { Badge, PageHeader } from '../../components/ui/feedback'
import { FilterBar, SearchInput } from '../../components/ui/inputs'
import { exportXlsx } from '../../utils/export'
import { errMsg } from '../../utils/errors'
import { number, rupiah } from '../../utils/format'
import type { ProductRow, StockStatus } from '../../types'
import ProductForm from './ProductForm'

const SIZE = 15
const stockBadge = { ok: null, low: <Badge tone="amber">Menipis</Badge>, out: <Badge tone="red">Habis</Badge> }

export default function Products() {
  const { storeId } = useStore()
  const toast = useToast()
  const dialog = useDialog()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [stock, setStock] = useState<'' | StockStatus>((params.get('stock') as StockStatus | null) ?? '')
  const [active, setActive] = useState<'' | '1' | '0'>('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<ProductRow | 'new' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: cats = [] } = useCategories()
  const q = useDebounced(search)
  const filters: ProductFilters = { search: q, categoryId, stock, active, page, size: SIZE }
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['products', storeId, filters], queryFn: () => listProducts(storeId, filters), placeholderData: prev => prev })
  const reset = (fn: () => void) => { fn(); setPage(1) }
  const setStockFilter = (v: '' | StockStatus) => { reset(() => setStock(v)); setParams(v ? { stock: v } : {}, { replace: true }) }

  const toggle = useMutation({
    mutationFn: (p: ProductRow) => setProductActive(p.id, !p.is_active),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['products', storeId] }), onError: e => toast.error(errMsg(e)),
  })
  const askToggle = async (p: ProductRow) => {
    if (p.is_active && !(await dialog.confirm({ title: `Nonaktifkan ${p.product_name}?`, message: 'Produk tidak akan muncul di kasir, tetapi riwayatnya tetap tersimpan.', confirmText: 'Nonaktifkan', danger: true }))) return
    toggle.mutate(p)
  }

  const exportAll = async () => {
    try {
      const rows = await listAllProducts(storeId, { search: q, categoryId, stock, active })
      await exportXlsx('produk-toko-diaz', [{ title: 'Produk', headers: ['Kode', 'Nama', 'Kategori', 'Satuan', 'Barcode', 'Harga jual', 'Stok minimum', 'Stok'],
        rows: rows.map(p => [p.product_code, p.product_name, p.category_name ?? '', p.unit, p.barcode ?? '', p.selling_price, p.minimum_stock, p.stock]) }])
    } catch (e) { toast.error(errMsg(e)) }
  }
  const onImport = async (file: File) => {
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer())
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]])
      const rows = raw.map(r => ({
        product_code: String(r.kode ?? r.Kode ?? '').trim(), product_name: String(r.nama ?? r.Nama ?? '').trim(), unit: String(r.satuan ?? r.Satuan ?? 'pcs') || 'pcs',
        barcode: r.barcode ?? r.Barcode ? String(r.barcode ?? r.Barcode) : null, selling_price: Number(r.harga_jual ?? r['Harga jual'] ?? 0) || 0, minimum_stock: Number(r.stok_minimum ?? r['Stok minimum'] ?? 0) || 0,
      }))
      if (!rows.length) return toast.error('File kosong.')
      const bad = rows.findIndex(r => !r.product_code || !r.product_name || r.selling_price < 0)
      if (bad >= 0) return toast.error(`Baris ${bad + 2}: kode dan nama wajib diisi, harga tidak boleh negatif.`)
      await importProducts(storeId, rows)
      toast.success(`${rows.length} baris diproses; kode yang sudah ada dilewati. Stok awal diisi lewat menu Stok.`)
      void qc.invalidateQueries({ queryKey: ['products', storeId] })
    } catch (e) { toast.error(errMsg(e, 'File tidak dapat dibaca atau import gagal.')) }
  }

  const columns: Column<ProductRow>[] = [
    { key: 'code', header: 'Kode', cell: p => <span className="font-mono text-xs">{p.product_code}</span> },
    { key: 'name', header: 'Produk', cell: p => <Link className="font-medium hover:text-brand-600" to={`/products/${p.id}`}>{p.product_name}</Link> },
    { key: 'cat', header: 'Kategori', cell: p => p.category_name ?? <span className="text-slate-400">-</span> },
    { key: 'price', header: 'Harga jual', align: 'right', cell: p => rupiah(p.selling_price) },
    { key: 'cost', header: 'HPP rata-rata', align: 'right', cell: p => rupiah(Math.round(p.average_cost)) },
    { key: 'stock', header: 'Stok', align: 'right', cell: p => <span className="inline-flex items-center gap-2">{stockBadge[p.stock_status]}<b className={p.stock_status === 'ok' ? '' : 'text-amber-600'}>{number(p.stock)}</b> {p.unit}</span> },
    { key: 'status', header: 'Status', cell: p => <Badge tone={p.is_active ? 'green' : 'slate'}>{p.is_active ? 'Aktif' : 'Nonaktif'}</Badge> },
    { key: 'act', header: '', align: 'right', cell: p => <span className="space-x-3 whitespace-nowrap"><button className="link" onClick={() => setEditing(p)}>Ubah</button><button className="text-slate-500 hover:underline" onClick={() => void askToggle(p)}>{p.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button></span> },
  ]
  return (
    <div className="space-y-5">
      {editing && <ProductForm product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <PageHeader title="Produk" description="Stok bertambah lewat pembelian atau penyesuaian, tidak diedit langsung." actions={<>
        <button className="btn-secondary" onClick={() => void exportAll()}><Download size={16} />Export</button>
        <button className="btn-secondary" onClick={() => fileRef.current?.click()}><Upload size={16} />Import</button>
        <input ref={fileRef} type="file" hidden accept=".xlsx,.csv" onChange={e => { const f = e.target.files?.[0]; if (f) void onImport(f); e.target.value = '' }} />
        <button className="btn-primary" onClick={() => setEditing('new')}><Plus size={16} />Tambah produk</button></>} />
      <FilterBar>
        <SearchInput className="w-full sm:w-72" value={search} onChange={v => reset(() => setSearch(v))} placeholder="Cari nama, kode, atau barcode" />
        <select className="input w-auto" value={categoryId} onChange={e => reset(() => setCategoryId(e.target.value))} aria-label="Filter kategori"><option value="">Semua kategori</option>{cats.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}</select>
        <select className="input w-auto" value={stock} onChange={e => setStockFilter(e.target.value as '' | StockStatus)} aria-label="Filter stok"><option value="">Semua stok</option><option value="ok">Aman</option><option value="low">Menipis</option><option value="out">Habis</option></select>
        <select className="input w-auto" value={active} onChange={e => reset(() => setActive(e.target.value as '' | '1' | '0'))} aria-label="Filter status"><option value="">Semua status</option><option value="1">Aktif</option><option value="0">Nonaktif</option></select>
      </FilterBar>
      <DataTable columns={columns} rows={data?.rows} rowKey={p => p.id} loading={isLoading} error={isError} onRetry={() => void refetch()}
        page={page} size={SIZE} total={data?.total} onPage={setPage}
        empty={{ title: 'Belum ada produk', description: search || categoryId || stock || active ? 'Tidak ada produk yang cocok dengan filter.' : 'Tambahkan produk pertama Anda untuk mulai berjualan.', action: <button className="btn-primary" onClick={() => setEditing('new')}><Plus size={16} />Tambah produk</button> }} />
    </div>)
}
