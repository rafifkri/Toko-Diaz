import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, Minus, Plus, Printer, ShoppingBasket, Trash2 } from 'lucide-react'
import { useStore } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDebounced, usePersistentState } from '../../hooks'
import { usePrintReceipt } from '../../hooks/print'
import { usePaymentSettings, useStoreSettings } from '../../hooks/queries'
import { listPosProducts } from '../../services/products'
import { createSale, getSale, listPendingSales } from '../../services/sales'
import { addToCart, reconcileCart, removeItem, setQty, totals, type CartItem } from '../../utils/cart'
import { errMsg } from '../../utils/errors'
import { rupiah } from '../../utils/format'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/feedback'
import Modal from '../../components/ui/Modal'
import { MoneyInput, SearchInput } from '../../components/ui/inputs'
import type { PaymentMethod, PosProduct } from '../../types'
import PendingPayment, { type PendingSale } from './PendingPayment'

const METHODS: [PaymentMethod, string][] = [['cash', 'Tunai'], ['transfer', 'Transfer'], ['qris', 'QRIS']]
interface Done { message: string; saleId?: string; change?: number }

interface CartProps {
  cart: CartItem[]; setCart: (f: (c: CartItem[]) => CartItem[]) => void; discount: number; setDiscount: (n: number) => void
  method: PaymentMethod; setMethod: (m: PaymentMethod) => void; received: number; setReceived: (n: number) => void
  enabled: Record<PaymentMethod, boolean>; busy: boolean; onPay: () => void
}
function CartPanel(p: CartProps) {
  const t = totals(p.cart, p.discount)
  const change = Math.max(p.received - t.total, 0)
  const quick = useMemo(() => { const base = [t.total, ...[5000, 10000, 20000, 50000, 100000].filter(v => v > t.total)]; return [...new Set(base)].slice(0, 4) }, [t.total])
  return (
    <div className="space-y-4">
      {p.cart.length === 0 ? <EmptyState title="Keranjang kosong" description="Pilih produk atau scan barcode untuk mulai." /> : (
        <ul className="max-h-[40vh] space-y-3 overflow-y-auto pr-1 lg:max-h-[34vh]">{p.cart.map(i => (
          <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0"><p className="truncate font-medium">{i.name}</p><p className="text-xs text-slate-500">{rupiah(i.price)} × {i.qty} = <b>{rupiah(i.price * i.qty)}</b></p></div>
            <div className="flex shrink-0 items-center gap-1">
              <button className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 hover:bg-slate-50" onClick={() => p.setCart(c => setQty(c, i.id, i.qty - 1))} aria-label={`Kurangi ${i.name}`}><Minus size={14} /></button>
              <input className="h-8 w-10 rounded-lg border border-slate-200 text-center text-sm" inputMode="numeric" value={i.qty} aria-label={`Jumlah ${i.name}`} onChange={e => p.setCart(c => setQty(c, i.id, Number(e.target.value.replace(/\D/g, ''))))} />
              <button className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40" disabled={i.qty >= i.stock} onClick={() => p.setCart(c => setQty(c, i.id, i.qty + 1))} aria-label={`Tambah ${i.name}`}><Plus size={14} /></button>
              <button className="ml-1 grid h-8 w-8 place-items-center rounded-lg text-red-500 hover:bg-red-50" onClick={() => p.setCart(c => removeItem(c, i.id))} aria-label={`Hapus ${i.name}`}><Trash2 size={15} /></button>
            </div></li>))}</ul>)}
      <div className="space-y-2 border-t border-slate-100 pt-3 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Subtotal ({t.count} barang)</span><span>{rupiah(t.subtotal)}</span></div>
        <div className="flex items-center justify-between gap-3"><label htmlFor="disc" className="text-slate-500">Diskon</label><MoneyInput id="disc" className="w-36 py-1.5 text-right" value={p.discount} onChange={n => p.setDiscount(Math.min(n, t.subtotal))} /></div>
        <div className="flex justify-between text-xl font-bold"><span>Total</span><span>{rupiah(t.total)}</span></div>
      </div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Metode pembayaran">{METHODS.map(([k, l]) => (
        <button key={k} role="radio" aria-checked={p.method === k} disabled={!p.enabled[k]} onClick={() => p.setMethod(k)} title={p.enabled[k] ? undefined : 'Dinonaktifkan di Pengaturan'}
          className={`btn border ${p.method === k ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300'}`}>{l}</button>))}</div>
      {p.method === 'cash' && (
        <div className="space-y-2">
          <MoneyInput value={p.received} onChange={p.setReceived} placeholder="Uang diterima" />
          <div className="flex flex-wrap gap-1.5">{quick.map(v => <button key={v} className="btn-secondary btn-sm" onClick={() => p.setReceived(v)}>{v === t.total ? 'Uang pas' : rupiah(v)}</button>)}</div>
          <p className={`text-sm font-semibold ${p.received >= t.total && t.total > 0 ? 'text-green-600' : 'text-slate-500'}`}>Kembalian: {rupiah(change)}</p>
        </div>)}
      <button className="btn-primary w-full py-3 text-base" disabled={p.busy || !p.cart.length || (p.method === 'cash' && p.received < t.total)} onClick={p.onPay}>
        {p.busy ? 'Memproses…' : p.method === 'cash' ? `Bayar ${rupiah(t.total)}` : 'Lanjut ke pembayaran'}</button>
      {p.cart.length > 0 && <button className="w-full text-xs text-slate-400 hover:text-red-500" onClick={() => { p.setCart(() => []); p.setDiscount(0); p.setReceived(0) }}>Kosongkan keranjang</button>}
    </div>)
}

export default function Pos() {
  const { storeId, userId } = useStore(); const toast = useToast(); const qc = useQueryClient(); const print = usePrintReceipt()
  const [q, setQ] = useState(''); const search = useDebounced(q, 150)
  const [cart, setCart] = usePersistentState<CartItem[]>(`toko-diaz:cart:${storeId}:${userId}`, [])
  const [discount, setDiscount] = useState(0); const [method, setMethod] = useState<PaymentMethod>('cash'); const [received, setReceived] = useState(0)
  const [pending, setPending] = useState<PendingSale | null>(null); const [done, setDone] = useState<Done | null>(null); const [sheet, setSheet] = useState(false)
  const { data: products = [], isLoading, isError, refetch } = useQuery({ queryKey: ['pos-products', storeId], queryFn: () => listPosProducts(storeId), staleTime: 60_000 })
  const { data: pay } = usePaymentSettings(); const { data: settings } = useStoreSettings()
  const { data: pendingList = [] } = useQuery({ queryKey: ['pending-sales', storeId], queryFn: () => listPendingSales(storeId), refetchInterval: 60_000 })
  const enabled: Record<PaymentMethod, boolean> = useMemo(() => {
    const on = (m: PaymentMethod) => { const s = pay?.find(x => x.payment_method === m); return m === 'qris' ? !!s?.is_active && !!s.qris_path : s ? s.is_active : true }
    return { cash: on('cash'), transfer: on('transfer'), qris: on('qris') }
  }, [pay])
  useEffect(() => { if (!enabled[method]) { const first = METHODS.find(([k]) => enabled[k]); if (first) setMethod(first[0]) } }, [enabled, method])
  // Harga dan stok bisa berubah sejak keranjang disimpan: selaraskan
  useEffect(() => { if (products.length) setCart(c => { const r = reconcileCart(c, products); return JSON.stringify(r) === JSON.stringify(c) ? c : r }) }, [products, setCart])

  const t = totals(cart, discount)
  const filtered = useMemo(() => { const s = search.trim().toLowerCase(); return s ? products.filter(p => (p.product_name + ' ' + p.product_code + ' ' + (p.barcode ?? '')).toLowerCase().includes(s)) : products }, [products, search])
  const add = (p: PosProduct) => { setCart(c => addToCart(c, p)); setDone(null) }
  const onEnter = () => { const s = q.trim(); const m = products.find(p => p.barcode === s || p.product_code.toLowerCase() === s.toLowerCase()); if (m) { add(m); setQ('') } else if (filtered.length === 1) { add(filtered[0]); setQ('') } }
  const reset = () => { setCart(() => []); setDiscount(0); setReceived(0); setSheet(false) }
  const afterSale = () => { void qc.invalidateQueries({ queryKey: ['pos-products', storeId] }); void qc.invalidateQueries({ queryKey: ['pending-sales', storeId] }); void qc.invalidateQueries({ queryKey: ['cashier-summary', storeId] }); void qc.invalidateQueries({ queryKey: ['low-stock', storeId] }) }

  const pay1 = useMutation({
    mutationFn: () => createSale({ storeId, items: cart.map(i => ({ product_id: i.id, quantity: i.qty })), discount: t.discount, method, received: method === 'cash' ? received : undefined }),
    onSuccess: async id => {
      const total = t.total; const rec = received; const m = method
      reset(); afterSale()
      if (m === 'cash') { setDone({ message: `Lunas. Kembalian ${rupiah(rec - total)}`, saleId: id, change: rec - total }); if (settings?.auto_print_receipt) void print(id) }
      else { try { const sale = await getSale(id); setPending({ id, invoice_number: sale.invoice_number, total_amount: sale.total_amount, payment_method: m }) } catch (e) { toast.error(errMsg(e)) } }
    },
    onError: e => { toast.error(errMsg(e, 'Transaksi gagal. Coba lagi.')); void refetch() },
  })
  const finishPending = (message: string, saleId?: string) => { setPending(null); afterSale(); setDone({ message, saleId: message.startsWith('Pembayaran') ? saleId : undefined }); if (message.startsWith('Pembayaran') && saleId && settings?.auto_print_receipt) void print(saleId) }

  if (pending) return <PendingPayment sale={pending} onDone={finishPending} onClose={() => { setPending(null); afterSale(); toast.info('Transaksi menunggu. Lanjutkan dari Riwayat Penjualan.') }} />
  const cartProps: CartProps = { cart, setCart, discount: t.discount, setDiscount, method, setMethod, received, setReceived, enabled, busy: pay1.isPending, onPay: () => pay1.mutate() }
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_390px]">
      <div className="min-w-0 space-y-4">
        {done && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700" role="status"><CheckCircle2 size={18} /><span className="font-semibold">{done.message}</span>
            {done.saleId && <button className="btn-secondary btn-sm ml-auto" onClick={() => void print(done.saleId!)}><Printer size={14} />Cetak struk</button>}</div>)}
        {pendingList.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800"><Clock size={16} /><span>{pendingList.length} transaksi menunggu pembayaran.</span><Link to="/sales?status=pending" className="font-semibold underline">Selesaikan</Link></div>)}
        <SearchInput className="sticky top-16 z-10" value={q} onChange={v => { setQ(v); setDone(null) }} onEnter={onEnter} autoFocus placeholder="Cari nama, kode, atau scan barcode lalu Enter" />
        {isError ? <div className="card"><ErrorState onRetry={() => void refetch()} /></div> : isLoading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : filtered.length === 0 ? <div className="card"><EmptyState title={products.length ? 'Produk tidak ditemukan' : 'Belum ada produk'} description={products.length ? 'Coba kata kunci lain.' : 'Minta pemilik menambahkan produk dan stok.'} /></div> : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{filtered.map(p => {
            const inCart = cart.find(i => i.id === p.id)?.qty ?? 0
            return (
              <button key={p.id} disabled={p.stock <= 0} onClick={() => add(p)} className="card relative p-3 text-left transition hover:border-brand-500 hover:shadow-md active:scale-[.98] disabled:opacity-40">
                {inCart > 0 && <span className="absolute right-2 top-2 grid h-6 min-w-6 place-items-center rounded-full bg-brand-600 px-1.5 text-xs font-bold text-white">{inCart}</span>}
                {p.photo ? <img src={p.photo} alt="" loading="lazy" className="mb-2 h-20 w-full rounded-lg object-cover" /> : <div className="mb-2 grid h-20 place-items-center rounded-lg bg-slate-100 text-slate-300"><ShoppingBasket size={26} /></div>}
                <p className="line-clamp-2 text-sm font-semibold leading-snug">{p.product_name}</p><p className="mt-1 font-bold text-brand-600">{rupiah(p.selling_price)}</p>
                <p className={`text-xs ${p.stock <= 0 ? 'font-semibold text-red-500' : p.stock <= p.minimum_stock ? 'text-amber-600' : 'text-slate-500'}`}>{p.stock <= 0 ? 'Habis' : `Stok ${p.stock} ${p.unit}`}</p></button>)
          })}</div>)}
      </div>
      <aside className="card hidden h-fit space-y-4 lg:sticky lg:top-20 lg:block"><h2 className="font-bold">Keranjang</h2><CartPanel {...cartProps} /></aside>
      {/* Ponsel: bilah ringkas di bawah, keranjang muncul sebagai lembar bawah */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur lg:hidden print:hidden" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <button className="btn-primary w-full justify-between py-3" onClick={() => setSheet(true)} disabled={!cart.length}><span className="flex items-center gap-2"><ShoppingBasket size={18} />{t.count} barang</span><span>{rupiah(t.total)}</span></button></div>
      <Modal open={sheet} onClose={() => setSheet(false)} title="Keranjang"><CartPanel {...cartProps} /></Modal>
    </div>)
}
