import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Clock } from 'lucide-react'
import { useStore } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDialog } from '../../contexts/DialogContext'
import { usePaymentSettings } from '../../hooks/queries'
import { cancelPending, confirmPayment, failPending } from '../../services/sales'
import { getStoreProfile, logoUrl, qrisUrl } from '../../services/settings'
import { Spinner } from '../../components/ui/feedback'
import { errMsg } from '../../utils/errors'
import { rupiah } from '../../utils/format'
import type { Sale } from '../../types'

export type PendingSale = Pick<Sale, 'id' | 'invoice_number' | 'total_amount' | 'payment_method'>

/**
 * Layar pembayaran transfer/QRIS untuk transaksi berstatus pending.
 * Dipakai di Kasir (setelah "Lanjut ke pembayaran") dan untuk melanjutkan transaksi yang tertunda dari Riwayat.
 */
export default function PendingPayment({ sale, onDone, onClose }: { sale: PendingSale; onDone: (msg: string, saleId?: string) => void; onClose: () => void }) {
  const { storeId, storeName } = useStore(); const toast = useToast(); const dialog = useDialog()
  const [reference, setReference] = useState('')
  const { data: pay } = usePaymentSettings()
  const setting = pay?.find(p => p.payment_method === sale.payment_method)
  const { data: profile } = useQuery({ queryKey: ['store-profile', storeId], queryFn: () => getStoreProfile(storeId) })
  const { data: logo } = useQuery({ queryKey: ['logo', profile?.logo_url], enabled: !!profile?.logo_url, queryFn: () => logoUrl(profile?.logo_url ?? null) })
  const { data: qr, isLoading: qrLoading } = useQuery({ queryKey: ['qris', setting?.qris_path], enabled: sale.payment_method === 'qris' && !!setting?.qris_path, queryFn: () => qrisUrl(setting?.qris_path ?? null) })
  const done = (m: string, fn: () => Promise<void>, msg: string) => fn().then(() => onDone(m, sale.id)).catch((e: unknown) => toast.error(errMsg(e, msg)))
  const confirm = useMutation({ mutationFn: () => confirmPayment(sale.id, reference), onSuccess: () => onDone('Pembayaran dikonfirmasi.', sale.id), onError: (e: unknown) => toast.error(errMsg(e, 'Konfirmasi gagal.')) })
  const cancel = async () => { if (await dialog.confirm({ title: 'Batalkan transaksi?', message: `${sale.invoice_number} akan dibatalkan dan stok tidak berubah.`, confirmText: 'Batalkan transaksi', danger: true })) await done('Transaksi dibatalkan.', () => cancelPending(sale.id), 'Pembatalan gagal.') }
  const fail = async () => {
    const reason = await dialog.prompt({ title: 'Tandai pembayaran gagal?', message: 'Gunakan bila dana tidak masuk atau pelanggan tidak jadi membayar.', label: 'Alasan', required: false, confirmText: 'Tandai gagal', danger: true })
    if (reason !== null) await done('Transaksi ditandai gagal.', () => failPending(sale.id, reason), 'Gagal memperbarui status.')
  }
  const isQris = sale.payment_method === 'qris'
  return (
    <div className="mx-auto max-w-md animate-slide-up space-y-4 card text-center">
      <div className="flex items-center justify-center gap-3">{logo && <img src={logo} alt="" className="h-10 w-10 rounded object-cover" />}<p className="text-lg font-bold">{profile?.store_name ?? storeName}</p></div>
      <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"><Clock size={13} />Menunggu pembayaran · {sale.invoice_number}</p>
      {isQris && (qrLoading ? <div className="grid h-48 place-items-center text-brand-600"><Spinner className="h-7 w-7" /></div> : qr ? <img src={qr} alt="QRIS toko" className="mx-auto max-h-80 rounded-lg border border-slate-200" /> :
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">QRIS belum diunggah. Minta pemilik mengunggahnya di Pengaturan.</p>)}
      {!isQris && (setting?.bank_account_number ? (
        <div className="rounded-xl bg-slate-50 p-4 text-left text-sm"><p className="text-xs text-slate-500">Transfer ke</p><p className="font-bold">{setting.bank_name}</p>
          <p className="font-mono text-lg font-bold tracking-wide">{setting.bank_account_number}</p><p className="text-slate-600">a.n. {setting.bank_account_name}</p></div>) :
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Rekening toko belum diisi di Pengaturan. Sampaikan rekening tujuan secara lisan.</p>)}
      <div><p className="text-sm text-slate-500">Nominal yang harus dibayar</p><p className="text-4xl font-bold text-brand-600">{rupiah(sale.total_amount)}</p></div>
      <div className="text-left"><label className="label" htmlFor="ref">{isQris ? 'Referensi / 4 digit terakhir transaksi (opsional)' : 'Referensi transfer (opsional)'}</label>
        <input id="ref" className="input" value={reference} maxLength={60} onChange={e => setReference(e.target.value)} placeholder="Mis. nama pengirim atau nomor referensi" /></div>
      <p className="text-xs text-slate-500">{isQris ? 'QRIS statis: pelanggan memasukkan nominal sendiri. ' : ''}Konfirmasi hanya setelah dana terlihat di aplikasi bank/merchant.</p>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-primary col-span-2 py-3" disabled={confirm.isPending} onClick={() => confirm.mutate()}>{confirm.isPending ? 'Memproses…' : 'Konfirmasi pembayaran'}</button>
        <button className="btn-secondary text-red-600" onClick={() => void fail()}>Pembayaran gagal</button>
        <button className="btn-secondary" onClick={() => void cancel()}>Batalkan</button>
        <button className="btn-ghost col-span-2 text-slate-500" onClick={onClose}>Tutup dulu (lanjutkan nanti dari Riwayat)</button>
      </div>
    </div>)
}
