import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, CreditCard, QrCode, Trash2 } from 'lucide-react'
import type { z } from 'zod'
import { useStore } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDialog } from '../../contexts/DialogContext'
import { usePaymentSettings, useStoreSettings } from '../../hooks/queries'
import { bankSchema, receiptSettingsSchema, stockSettingsSchema, storeProfileSchema, type StoreProfileForm } from '../../schemas'
import { getStoreProfile, logoUrl, qrisUrl, removeQris, savePaymentSetting, saveStoreSettings, updateStoreProfile, uploadLogo, uploadQris } from '../../services/settings'
import { validateImage } from '../../services/storage'
import { Field, PageHeader, Skeleton, Tabs } from '../../components/ui/feedback'
import { MoneyInput } from '../../components/ui/inputs'
import { errMsg } from '../../utils/errors'
import type { PaymentMethod } from '../../types'

const TABS = [['store', 'Profil toko'], ['payment', 'Pembayaran'], ['receipt', 'Struk'], ['stock', 'Stok']] as const
type Tab = (typeof TABS)[number][0]
const fileCls = 'block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-semibold file:text-brand-700'

function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${checked ? 'bg-brand-600' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} /></button>)
}

function StoreTab() {
  const { storeId } = useStore(); const toast = useToast(); const qc = useQueryClient(); const [logoErr, setLogoErr] = useState('')
  const { data, isLoading } = useQuery({ queryKey: ['store-profile', storeId], queryFn: () => getStoreProfile(storeId) })
  const { data: logo } = useQuery({ queryKey: ['logo', data?.logo_url], enabled: !!data?.logo_url, queryFn: () => logoUrl(data?.logo_url ?? null) })
  const { register, handleSubmit, reset, formState: { errors } } = useForm<StoreProfileForm>({ resolver: zodResolver(storeProfileSchema), defaultValues: { store_name: '', address: '', phone: '', email: '' } })
  useEffect(() => { if (data) reset({ store_name: data.store_name, address: data.address ?? '', phone: data.phone ?? '', email: data.email ?? '' }) }, [data, reset])
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['store-profile', storeId] }); void qc.invalidateQueries({ queryKey: ['logo'] }) }
  const save = useMutation({ mutationFn: (v: StoreProfileForm) => updateStoreProfile(storeId, v), onSuccess: () => { refresh(); toast.success('Profil toko disimpan. Muat ulang untuk melihat nama baru di header.') }, onError: e => toast.error(errMsg(e)) })
  const up = useMutation({ mutationFn: (f: File) => uploadLogo(storeId, f), onSuccess: () => { refresh(); toast.success('Logo diperbarui.') }, onError: e => toast.error(errMsg(e)) })
  if (isLoading) return <Skeleton className="h-64" />
  return (
    <form onSubmit={handleSubmit(v => save.mutate(v))} className="card max-w-2xl space-y-4" noValidate>
      <div className="flex items-center gap-4">{logo ? <img src={logo} alt="Logo toko" className="h-16 w-16 rounded-xl object-cover" /> : <div className="grid h-16 w-16 place-items-center rounded-xl bg-slate-100 text-xs text-slate-400">Logo</div>}
        <div className="flex-1"><span className="label">Logo toko (PNG/JPG, maks 2 MB)</span><input type="file" accept="image/png,image/jpeg" className={fileCls}
          onChange={e => { const f = e.target.files?.[0]; if (!f) return; const m = validateImage(f); setLogoErr(m ?? ''); if (!m) up.mutate(f) }} />{logoErr && <p className="mt-1 text-xs text-red-600">{logoErr}</p>}</div></div>
      <Field label="Nama toko" error={errors.store_name?.message}><input className="input" {...register('store_name')} /></Field>
      <Field label="Alamat (tampil di struk)"><input className="input" {...register('address')} /></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Telepon"><input className="input" inputMode="tel" {...register('phone')} /></Field><Field label="Email" error={errors.email?.message}><input className="input" type="email" {...register('email')} /></Field></div>
      <button className="btn-primary" disabled={save.isPending}>Simpan</button>
    </form>)
}

type BankForm = z.infer<typeof bankSchema>
function PaymentTab() {
  const { storeId } = useStore(); const toast = useToast(); const dialog = useDialog(); const qc = useQueryClient(); const [qErr, setQErr] = useState('')
  const { data: pay, isLoading } = usePaymentSettings()
  const get = (m: PaymentMethod) => pay?.find(p => p.payment_method === m)
  const transfer = get('transfer'); const qris = get('qris')
  const { data: preview } = useQuery({ queryKey: ['qris', qris?.qris_path], enabled: !!qris?.qris_path, queryFn: () => qrisUrl(qris?.qris_path ?? null) })
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['payment-settings', storeId] }); void qc.invalidateQueries({ queryKey: ['qris'] }) }
  const toggle = useMutation({ mutationFn: ({ m, on }: { m: PaymentMethod; on: boolean }) => savePaymentSetting(storeId, m, { is_active: on }), onSuccess: refresh, onError: e => toast.error(errMsg(e)) })
  const bank = useForm<BankForm>({ resolver: zodResolver(bankSchema), defaultValues: { bank_name: '', bank_account_number: '', bank_account_name: '' } })
  useEffect(() => { if (transfer) bank.reset({ bank_name: transfer.bank_name ?? '', bank_account_number: transfer.bank_account_number ?? '', bank_account_name: transfer.bank_account_name ?? '' }) }, [transfer, bank])
  const saveBank = useMutation({ mutationFn: (v: BankForm) => savePaymentSetting(storeId, 'transfer', { bank_name: v.bank_name?.trim() || null, bank_account_number: v.bank_account_number?.trim() || null, bank_account_name: v.bank_account_name?.trim() || null }),
    onSuccess: () => { refresh(); toast.success('Rekening disimpan.') }, onError: e => toast.error(errMsg(e)) })
  const upQ = useMutation({ mutationFn: (f: File) => uploadQris(storeId, f), onSuccess: () => { refresh(); toast.success('QRIS diunggah dan diaktifkan.') }, onError: e => toast.error(errMsg(e)) })
  const delQ = async () => { if (qris?.qris_path && await dialog.confirm({ title: 'Hapus QRIS?', message: 'Metode QRIS dinonaktifkan sampai Anda mengunggah gambar baru.', confirmText: 'Hapus', danger: true })) { try { await removeQris(storeId, qris.qris_path); refresh(); toast.success('QRIS dihapus.') } catch (e) { toast.error(errMsg(e)) } } }
  if (isLoading) return <Skeleton className="h-64" />
  const rows: [PaymentMethod, string, string, typeof Banknote, boolean][] = [
    ['cash', 'Tunai', 'Uang diterima dan kembalian dicatat di struk.', Banknote, get('cash')?.is_active ?? true],
    ['transfer', 'Transfer bank', 'Kasir menampilkan rekening toko, lalu mengonfirmasi manual.', CreditCard, transfer?.is_active ?? true],
    ['qris', 'QRIS', 'Gambar QRIS statis ditampilkan di layar kasir.', QrCode, !!qris?.is_active && !!qris.qris_path]]
  return (
    <div className="max-w-2xl space-y-5">
      <div className="card divide-y divide-slate-100 p-0">{rows.map(([m, l, d, Icon, on]) => (
        <div key={m} className="flex items-center gap-4 px-5 py-4"><div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-600"><Icon size={18} /></div>
          <div className="flex-1"><p className="font-semibold">{l}</p><p className="text-xs text-slate-500">{d}</p>{m === 'qris' && !qris?.qris_path && <p className="text-xs text-amber-600">Unggah gambar QRIS untuk mengaktifkan.</p>}</div>
          <Toggle label={`Aktifkan ${l}`} checked={on} disabled={toggle.isPending || (m === 'qris' && !qris?.qris_path)} onChange={v => toggle.mutate({ m, on: v })} /></div>))}</div>
      <form onSubmit={bank.handleSubmit(v => saveBank.mutate(v))} className="card space-y-4"><h2 className="font-bold">Rekening untuk transfer</h2>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Nama bank"><input className="input" placeholder="BCA, BRI, Mandiri…" {...bank.register('bank_name')} /></Field><Field label="Nomor rekening"><input className="input" inputMode="numeric" {...bank.register('bank_account_number')} /></Field></div>
        <Field label="Atas nama"><input className="input" {...bank.register('bank_account_name')} /></Field><button className="btn-primary" disabled={saveBank.isPending}>Simpan rekening</button></form>
      <div className="card space-y-3"><h2 className="font-bold">Gambar QRIS</h2>
        {preview ? <img src={preview} alt="QRIS toko" className="max-h-64 rounded-lg border border-slate-200" /> : <p className="text-sm text-slate-500">Belum ada gambar QRIS.</p>}
        <input type="file" accept="image/png,image/jpeg" className={fileCls} onChange={e => { const f = e.target.files?.[0]; if (!f) return; const m = validateImage(f); setQErr(m ?? ''); if (!m) upQ.mutate(f) }} />{qErr && <p className="text-xs text-red-600">{qErr}</p>}
        {qris?.qris_path && <button className="btn-secondary btn-sm text-red-600" onClick={() => void delQ()}><Trash2 size={14} />Hapus QRIS</button>}</div>
    </div>)
}

type RForm = z.infer<typeof receiptSettingsSchema>
function ReceiptTab() {
  const { storeId } = useStore(); const toast = useToast(); const qc = useQueryClient()
  const { data } = useStoreSettings()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<RForm>({ resolver: zodResolver(receiptSettingsSchema), defaultValues: { receipt_footer: '', receipt_width: 58, auto_print_receipt: false } })
  useEffect(() => { if (data) reset({ receipt_footer: data.receipt_footer, receipt_width: data.receipt_width, auto_print_receipt: data.auto_print_receipt }) }, [data, reset])
  const save = useMutation({ mutationFn: (v: RForm) => saveStoreSettings(storeId, { ...v, receipt_width: Number(v.receipt_width) as 58 | 80 }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['store-settings', storeId] }); toast.success('Pengaturan struk disimpan.') }, onError: e => toast.error(errMsg(e)) })
  if (!data) return <Skeleton className="h-48" />
  return (
    <form onSubmit={handleSubmit(v => save.mutate(v))} className="card max-w-2xl space-y-4" noValidate>
      <Field label="Pesan di bawah struk" error={errors.receipt_footer?.message}><input className="input" maxLength={150} {...register('receipt_footer')} /></Field>
      <Field label="Lebar kertas default"><select className="input" {...register('receipt_width', { valueAsNumber: true })}><option value={58}>58 mm (printer thermal kecil)</option><option value={80}>80 mm</option></select></Field>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register('auto_print_receipt')} />Cetak struk otomatis setelah transaksi lunas</label>
      <button className="btn-primary" disabled={save.isPending}>Simpan</button>
    </form>)
}

type SForm = z.infer<typeof stockSettingsSchema>
function StockTab() {
  const { storeId } = useStore(); const toast = useToast(); const qc = useQueryClient()
  const { data } = useStoreSettings()
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<SForm>({ resolver: zodResolver(stockSettingsSchema), defaultValues: { default_unit: 'pcs', default_minimum_stock: 0 } })
  useEffect(() => { if (data) reset({ default_unit: data.default_unit, default_minimum_stock: data.default_minimum_stock }) }, [data, reset])
  const save = useMutation({ mutationFn: (v: SForm) => saveStoreSettings(storeId, v), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['store-settings', storeId] }); toast.success('Pengaturan stok disimpan.') }, onError: e => toast.error(errMsg(e)) })
  if (!data) return <Skeleton className="h-40" />
  return (
    <form onSubmit={handleSubmit(v => save.mutate(v))} className="card max-w-2xl space-y-4" noValidate>
      <p className="text-sm text-slate-500">Nilai bawaan saat menambah produk baru. Produk yang sudah ada tidak berubah.</p>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Satuan default" error={errors.default_unit?.message}><input className="input" {...register('default_unit')} /></Field>
        <Field label="Batas stok minimum default" error={errors.default_minimum_stock?.message}><MoneyInput value={watch('default_minimum_stock')} onChange={n => setValue('default_minimum_stock', n, { shouldValidate: true })} /></Field></div>
      <button className="btn-primary" disabled={save.isPending}>Simpan</button>
    </form>)
}

export default function Settings() {
  const [tab, setTab] = useState<Tab>('store')
  return (
    <div className="space-y-5"><PageHeader title="Pengaturan" description="Profil toko, metode pembayaran, struk, dan stok." /><Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'store' && <StoreTab />}{tab === 'payment' && <PaymentTab />}{tab === 'receipt' && <ReceiptTab />}{tab === 'stock' && <StockTab />}</div>)
}
