import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, CreditCard, Pencil, XCircle } from 'lucide-react'
import { useStore } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDialog } from '../../contexts/DialogContext'
import { paymentSchema, type PaymentForm } from '../../schemas'
import { cancelPurchase, getPurchase, payPurchase, receivePurchase } from '../../services/purchases'
import Modal from '../../components/ui/Modal'
import { ErrorState, Field, PageHeader, Skeleton, StatusBadge, purchasePay, receivingStatus } from '../../components/ui/feedback'
import { DatePicker, MoneyInput } from '../../components/ui/inputs'
import { iso } from '../../utils/period'
import { errMsg } from '../../utils/errors'
import { dateLabel, number, rupiah } from '../../utils/format'

const methodLabel = { cash: 'Tunai', transfer: 'Transfer', other: 'Lainnya' }

function PayModal({ id, remaining, onClose }: { id: string; remaining: number; onClose: () => void }) {
  const toast = useToast(); const qc = useQueryClient(); const { storeId } = useStore()
  const { control, register, handleSubmit, formState: { errors } } = useForm<PaymentForm>({ resolver: zodResolver(paymentSchema), defaultValues: { amount: remaining, payment_method: 'cash', payment_date: iso(new Date()), notes: '' } })
  const pay = useMutation({
    mutationFn: (v: PaymentForm) => payPurchase(id, v.amount, v.payment_method, v.payment_date, v.notes),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['purchase', id] }); void qc.invalidateQueries({ queryKey: ['purchases', storeId] }); void qc.invalidateQueries({ queryKey: ['dashboard', storeId] }); toast.success('Pembayaran dicatat.'); onClose() },
    onError: e => toast.error(errMsg(e)),
  })
  return (
    <Modal open onClose={onClose} title="Bayar utang supplier" size="sm" footer={<><button className="btn-secondary" onClick={onClose}>Batal</button><button className="btn-primary" form="pay-form" disabled={pay.isPending}>Catat pembayaran</button></>}>
      <form id="pay-form" onSubmit={handleSubmit(v => pay.mutate(v))} className="space-y-4" noValidate>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Sisa utang <b>{rupiah(remaining)}</b>. Pembayaran boleh dicicil.</p>
        <Field label="Nominal" error={errors.amount?.message}><Controller control={control} name="amount" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} invalid={!!errors.amount} />} /></Field>
        <Field label="Tanggal bayar"><Controller control={control} name="payment_date" render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} max={iso(new Date())} />} /></Field>
        <Field label="Metode"><select className="input" {...register('payment_method')}><option value="cash">Tunai</option><option value="transfer">Transfer</option><option value="other">Lainnya</option></select></Field>
        <Field label="Catatan"><input className="input" {...register('notes')} /></Field>
      </form>
    </Modal>)
}

export default function PurchaseDetail() {
  const { id = '' } = useParams()
  const { storeId } = useStore(); const toast = useToast(); const dialog = useDialog(); const qc = useQueryClient()
  const [paying, setPaying] = useState(false)
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['purchase', id], queryFn: () => getPurchase(id) })
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['purchase', id] }); void qc.invalidateQueries({ queryKey: ['purchases', storeId] }); void qc.invalidateQueries({ queryKey: ['products', storeId] }); void qc.invalidateQueries({ queryKey: ['product-options', storeId] }); void qc.invalidateQueries({ queryKey: ['low-stock', storeId] }) }
  const act = useMutation({ mutationFn: (fn: 'receive' | 'cancel') => (fn === 'receive' ? receivePurchase(id) : cancelPurchase(id)),
    onSuccess: (_, fn) => { toast.success(fn === 'receive' ? 'Barang diterima, stok bertambah.' : 'Pembelian dibatalkan.'); refresh() }, onError: e => toast.error(errMsg(e)) })
  if (isError) return <div className="card"><ErrorState message="Pembelian tidak ditemukan." onRetry={() => void refetch()} /></div>
  if (isLoading || !data) return <Skeleton className="h-80" />
  const { purchase: p, items, payments } = data
  const remaining = p.total_amount - p.paid_amount
  const receive = async () => { if (await dialog.confirm({ title: 'Terima barang?', message: 'Stok dan HPP rata-rata akan diperbarui. Tindakan ini tidak dapat dibatalkan.', confirmText: 'Ya, barang diterima' })) act.mutate('receive') }
  const cancel = async () => { if (await dialog.confirm({ title: 'Batalkan pembelian?', message: `Draft ${p.purchase_number} akan dibatalkan.`, confirmText: 'Batalkan pembelian', danger: true })) act.mutate('cancel') }
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {paying && <PayModal id={id} remaining={remaining} onClose={() => setPaying(false)} />}
      <Link to="/purchases" className="link inline-flex items-center gap-1 text-sm"><ArrowLeft size={14} />Semua pembelian</Link>
      <PageHeader title={p.purchase_number} description={`${dateLabel(p.purchase_date)} · ${p.suppliers?.supplier_name ?? 'Tanpa supplier'}`} actions={<>
        <StatusBadge map={receivingStatus} value={p.receiving_status} />{p.receiving_status !== 'cancelled' && <StatusBadge map={purchasePay} value={p.payment_status} />}
        {p.receiving_status === 'draft' && <>
          <Link to={`/purchases/${id}/edit`} className="btn-secondary"><Pencil size={15} />Ubah</Link>
          <button className="btn-secondary text-red-600" onClick={() => void cancel()}><XCircle size={15} />Batalkan</button>
          <button className="btn-primary" onClick={() => void receive()} disabled={act.isPending}><CheckCircle2 size={15} />Terima barang</button></>}
        {p.receiving_status === 'received' && remaining > 0 && <button className="btn-primary" onClick={() => setPaying(true)}><CreditCard size={15} />Bayar utang</button>}</>} />
      <div className="card grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        {[['Subtotal', rupiah(p.subtotal)], ['Diskon', rupiah(p.discount)], ['Total', rupiah(p.total_amount)], ['Sudah dibayar', rupiah(p.paid_amount)],
          ['Sisa utang', rupiah(p.receiving_status === 'received' ? remaining : 0)], ['Metode', methodLabel[p.payment_method]], ['Jatuh tempo', dateLabel(p.due_date)], ['Catatan', p.notes ?? '-']].map(([k, v]) =>
          <div key={k}><p className="text-xs text-slate-500">{k}</p><p className="font-semibold">{v}</p></div>)}
      </div>
      <div className="card overflow-hidden p-0"><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
        <th className="px-4 py-3 text-left">Produk</th><th className="px-4 py-3 text-right">Jumlah</th><th className="px-4 py-3 text-right">Harga beli</th><th className="px-4 py-3 text-right">HPP setelah diskon</th><th className="px-4 py-3 text-right">Subtotal</th></tr></thead>
        <tbody>{items.map(i => <tr key={i.id} className="border-t border-slate-100"><td className="px-4 py-3 font-medium">{i.products?.product_name}</td><td className="px-4 py-3 text-right">{number(i.quantity)} {i.products?.unit}</td>
          <td className="px-4 py-3 text-right">{rupiah(i.unit_cost)}</td><td className="px-4 py-3 text-right text-slate-500">{i.allocated_cost != null && p.receiving_status === 'received' ? rupiah(Math.round(i.allocated_cost)) : '-'}</td><td className="px-4 py-3 text-right font-semibold">{rupiah(i.subtotal)}</td></tr>)}</tbody></table></div></div>
      <h2 className="font-bold">Riwayat pembayaran</h2>
      {payments.length === 0 ? <p className="card text-center text-sm text-slate-500">Belum ada pembayaran.</p> : (
        <div className="card divide-y divide-slate-100 p-0">{payments.map(x => (
          <div key={x.id} className="flex items-center justify-between px-5 py-3 text-sm"><div><p className="font-medium">{dateLabel(x.payment_date)} · {methodLabel[x.payment_method]}</p>{x.notes && <p className="text-xs text-slate-400">{x.notes}</p>}</div><b>{rupiah(x.amount)}</b></div>))}</div>)}
    </div>)
}
