import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Pencil } from 'lucide-react'
import { getProduct, listMovements } from '../../services/products'
import { signedUrl } from '../../services/storage'
import DataTable, { type Column } from '../../components/ui/DataTable'
import { Badge, ErrorState, PageHeader, Skeleton } from '../../components/ui/feedback'
import { dateTimeLabel, number, rupiah } from '../../utils/format'
import { movementLabel } from '../inventory/labels'
import type { StockMovement } from '../../types'
import ProductForm from './ProductForm'

const SIZE = 10
export default function ProductDetail() {
  const { id = '' } = useParams()
  const [page, setPage] = useState(1)
  const [edit, setEdit] = useState(false)
  const { data: p, isLoading, isError, refetch } = useQuery({ queryKey: ['product', id], queryFn: () => getProduct(id) })
  const { data: photo } = useQuery({ queryKey: ['product-photo', p?.image_url], enabled: !!p?.image_url, queryFn: () => signedUrl('product-images', p?.image_url, 3600) })
  const mv = useQuery({ queryKey: ['product-moves', id, page], queryFn: () => listMovements(id, page, SIZE), placeholderData: prev => prev })
  if (isError) return <div className="card"><ErrorState message="Produk tidak ditemukan." onRetry={() => void refetch()} /></div>
  if (isLoading || !p) return <Skeleton className="h-64" />
  const margin = p.selling_price - Math.round(p.average_cost)
  const cols: Column<StockMovement>[] = [
    { key: 't', header: 'Waktu', cell: m => dateTimeLabel(m.created_at) },
    { key: 'type', header: 'Jenis', cell: m => movementLabel[m.movement_type] ?? m.movement_type },
    { key: 'q', header: 'Jumlah', align: 'right', cell: m => <b className={m.quantity < 0 ? 'text-red-600' : 'text-green-600'}>{m.quantity > 0 ? '+' : ''}{m.quantity}</b> },
    { key: 'b', header: 'Sebelum → sesudah', align: 'right', cell: m => `${m.stock_before} → ${m.stock_after}` },
    { key: 'n', header: 'Catatan', cell: m => m.notes ?? '' },
  ]
  const info: [string, string][] = [
    ['Harga jual', rupiah(p.selling_price)], ['HPP rata-rata', rupiah(Math.round(p.average_cost))], ['Margin per satuan', rupiah(margin)],
    ['Harga beli terakhir', rupiah(p.purchase_price)], ['Stok minimum', `${p.minimum_stock} ${p.unit}`], ['Barcode', p.barcode ?? '-'],
  ]
  return (
    <div className="space-y-5">
      {edit && <ProductForm product={p} onClose={() => setEdit(false)} />}
      <Link to="/products" className="link inline-flex items-center gap-1 text-sm"><ArrowLeft size={14} />Semua produk</Link>
      <PageHeader title={p.product_name} description={<span className="font-mono">{p.product_code} · {p.category_name ?? 'Tanpa kategori'}</span>}
        actions={<><Badge tone={p.is_active ? 'green' : 'slate'}>{p.is_active ? 'Aktif' : 'Nonaktif'}</Badge><button className="btn-secondary" onClick={() => setEdit(true)}><Pencil size={15} />Ubah</button></>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card flex items-center gap-5 lg:col-span-1">
          {photo ? <img src={photo} alt={p.product_name} className="h-24 w-24 rounded-lg object-cover" /> : <div className="grid h-24 w-24 place-items-center rounded-lg bg-slate-100 text-xs text-slate-400">Tanpa foto</div>}
          <div><p className="text-sm text-slate-500">Stok saat ini</p><p className="text-3xl font-bold">{number(p.stock)} <span className="text-base font-medium text-slate-500">{p.unit}</span></p>
            {p.stock_status !== 'ok' && <Badge tone={p.stock_status === 'out' ? 'red' : 'amber'}>{p.stock_status === 'out' ? 'Habis' : 'Menipis'}</Badge>}</div>
        </div>
        <dl className="card grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:col-span-2">{info.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-semibold">{v}</dd></div>)}</dl>
      </div>
      <h2 className="font-bold">Riwayat stok</h2>
      <DataTable columns={cols} rows={mv.data?.rows} rowKey={m => m.id} loading={mv.isLoading} error={mv.isError} onRetry={() => void mv.refetch()}
        page={page} size={SIZE} total={mv.data?.total} onPage={setPage} empty={{ title: 'Belum ada pergerakan stok' }} />
    </div>)
}
