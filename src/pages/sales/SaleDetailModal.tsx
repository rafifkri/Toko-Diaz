import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Printer, Undo2 } from 'lucide-react'
import { useStore } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { usePrintReceipt } from '../../hooks/print'
import { getReceipt, listReturns, refundSale } from '../../services/sales'
import Modal from '../../components/ui/Modal'
import { Skeleton, StatusBadge, saleStatus } from '../../components/ui/feedback'
import { errMsg } from '../../utils/errors'
import { dateTimeLabel, rupiah } from '../../utils/format'
import type { Receipt } from '../../types'

const METHOD = { cash: 'Tunai', transfer: 'Transfer', qris: 'QRIS' }

function RefundForm({ r, onClose }: { r: Receipt; onClose: () => void }) {
  const { storeId } = useStore(); const toast = useToast(); const qc = useQueryClient()
  const [qty, setQty] = useState<Record<string, number>>({}); const [reason, setReason] = useState(''); const [restock, setRestock] = useState(true)
  const picked = r.items.filter(i => (qty[i.id] ?? 0) > 0)
  const estimate = r.subtotal === 0 ? 0 : Math.round(picked.reduce((a, i) => a + (i.subtotal * (qty[i.id] ?? 0)) / i.quantity, 0) * r.total / r.subtotal)
  const run = useMutation({
    mutationFn: () => refundSale(r.id, reason, restock, picked.map(i => ({ sale_item_id: i.id, quantity: qty[i.id] }))),
    onSuccess: () => { for (const k of ['sales', 'sale', 'receipt', 'products', 'pos-products', 'dashboard', 'low-stock', 'moves']) void qc.invalidateQueries({ queryKey: [k] }); void storeId; toast.success('Refund diproses.'); onClose() },
    onError: e => toast.error(errMsg(e)),
  })
  const allRemaining = () => setQty(Object.fromEntries(r.items.map(i => [i.id, i.quantity - i.returned])))
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-slate-500">Pilih barang dan jumlah yang dikembalikan.</p><button className="link text-xs" onClick={allRemaining}>Pilih semua sisa</button></div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">{r.items.map(i => { const left = i.quantity - i.returned; return (
        <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm"><div className="min-w-0"><p className="truncate font-medium">{i.name}</p><p className="text-xs text-slate-500">Terjual {i.quantity} · sudah diretur {i.returned} · sisa {left}</p></div>
          <input type="number" min={0} max={left} disabled={left === 0} aria-label={`Jumlah retur ${i.name}`} className="input w-20 py-1.5 text-right" value={qty[i.id] ?? 0}
            onChange={e => setQty(s => ({ ...s, [i.id]: Math.max(0, Math.min(left, Math.floor(Number(e.target.value)) || 0)) }))} /></li>) })}</ul>
      <div><label className="label" htmlFor="why">Alasan retur</label><input id="why" className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Mis. barang rusak / salah beli" /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={restock} onChange={e => setRestock(e.target.checked)} />Barang kembali ke stok</label>
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">Perkiraan refund: <b>{rupiah(estimate)}</b> <span className="text-xs text-slate-400">(diskon transaksi dibagi proporsional)</span></p>
      <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Kembali</button>
        <button className="btn-danger" disabled={run.isPending || !picked.length || !reason.trim()} onClick={() => run.mutate()}>{run.isPending ? 'Memproses…' : 'Proses refund'}</button></div>
    </div>)
}

/** Detail isi transaksi: barang, pembayaran, riwayat retur, cetak struk, dan retur (owner). */
export default function SaleDetailModal({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const { isOwner } = useStore(); const print = usePrintReceipt()
  const [refund, setRefund] = useState(false)
  const { data: r, isLoading } = useQuery({ queryKey: ['receipt', saleId], queryFn: () => getReceipt(saleId) })
  const returns = useQuery({ queryKey: ['returns', saleId], enabled: isOwner, queryFn: () => listReturns(saleId) })
  return (
    <Modal open onClose={onClose} title={r ? r.invoice : 'Detail transaksi'} size="lg">
      {isLoading || !r ? <Skeleton className="h-48" /> : refund ? <RefundForm r={r} onClose={() => { setRefund(false); void returns.refetch() }} /> : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-slate-600"><StatusBadge map={saleStatus} value={r.status} /><span>{dateTimeLabel(r.date)}</span><span>Kasir: {r.cashier ?? '-'}</span><span>{METHOD[r.method]}{r.reference ? ` · ref ${r.reference}` : ''}</span></div>
          <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[420px]"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2 text-left">Barang</th><th className="px-3 py-2 text-right">Harga</th><th className="px-3 py-2 text-right">Jml</th><th className="px-3 py-2 text-right">Subtotal</th></tr></thead>
            <tbody>{r.items.map(i => <tr key={i.id} className="border-t border-slate-100"><td className="px-3 py-2">{i.name}{i.returned > 0 && <span className="ml-2 text-xs text-blue-600">retur {i.returned}</span>}</td><td className="px-3 py-2 text-right">{rupiah(i.price)}</td><td className="px-3 py-2 text-right">{i.quantity}</td><td className="px-3 py-2 text-right font-medium">{rupiah(i.subtotal)}</td></tr>)}</tbody></table></div>
          <dl className="ml-auto max-w-xs space-y-1">
            <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>{rupiah(r.subtotal)}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Diskon</dt><dd>{rupiah(r.discount)}</dd></div>
            <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{rupiah(r.total)}</dd></div>
            {r.method === 'cash' && r.received != null && <><div className="flex justify-between"><dt className="text-slate-500">Uang diterima</dt><dd>{rupiah(r.received)}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Kembalian</dt><dd>{rupiah(r.change)}</dd></div></>}
            {r.refunded > 0 && <div className="flex justify-between text-blue-700"><dt>Total refund</dt><dd>-{rupiah(r.refunded)}</dd></div>}</dl>
          {isOwner && (returns.data?.length ?? 0) > 0 && (
            <div><p className="mb-1 font-semibold">Riwayat retur</p><ul className="space-y-1">{returns.data?.map(x => <li key={x.id} className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">{x.return_number} · {dateTimeLabel(x.created_at)} · {rupiah(x.refund_amount)} · {x.restock ? 'masuk stok' : 'tanpa restock'} · “{x.reason}”</li>)}</ul></div>)}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
            <button className="btn-secondary" onClick={() => void print(r.id)}><Printer size={15} />Cetak struk</button>
            {isOwner && r.status === 'paid' && r.items.some(i => i.returned < i.quantity) && <button className="btn-secondary text-red-600" onClick={() => setRefund(true)}><Undo2 size={15} />Retur / refund</button>}
          </div>
        </div>)}
    </Modal>)
}
