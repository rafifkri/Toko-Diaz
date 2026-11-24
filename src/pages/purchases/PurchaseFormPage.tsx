import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useProductOptions, useSupplierOptions } from '../../hooks/queries'
import { purchaseSchema, type PurchaseForm } from '../../schemas'
import { createPurchase, getPurchase, updatePurchaseDraft } from '../../services/purchases'
import { Field, PageHeader, Skeleton } from '../../components/ui/feedback'
import { Combobox, DatePicker, MoneyInput } from '../../components/ui/inputs'
import { iso } from '../../utils/period'
import { errMsg } from '../../utils/errors'
import { rupiah } from '../../utils/format'

const empty: PurchaseForm = {
  supplier_id: '', purchase_date: iso(new Date()), payment_method: 'cash', pay_on_receive: false, discount: 0, notes: '', due_date: '',
  lines: [{ product_id: '', quantity: 1, unit_cost: 0 }],
}

/** Satu halaman untuk pembelian baru dan edit draft (/purchases/:id/edit). */
export default function PurchaseFormPage() {
  const { id } = useParams(); const editing = !!id
  const { storeId } = useStore(); const nav = useNavigate(); const toast = useToast(); const qc = useQueryClient()
  const { data: sups = [] } = useSupplierOptions()
  const { data: products = [] } = useProductOptions()
  const existing = useQuery({ queryKey: ['purchase', id], enabled: editing, queryFn: () => getPurchase(id!) })
  const { control, register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<PurchaseForm>({ resolver: zodResolver(purchaseSchema), defaultValues: empty })
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })

  useEffect(() => {
    const d = existing.data
    if (!d) return
    if (d.purchase.receiving_status !== 'draft') { toast.error('Hanya pembelian draft yang dapat diubah.'); nav(`/purchases/${d.purchase.id}`, { replace: true }); return }
    reset({
      supplier_id: d.purchase.supplier_id ?? '', purchase_date: d.purchase.purchase_date, payment_method: d.purchase.payment_method, pay_on_receive: d.purchase.pay_on_receive,
      discount: d.purchase.discount, notes: d.purchase.notes ?? '', due_date: d.purchase.due_date ?? '',
      lines: d.items.map(i => ({ product_id: i.product_id, quantity: i.quantity, unit_cost: i.unit_cost })),
    })
  }, [existing.data, reset, nav, toast])

  const save = useMutation({
    mutationFn: (v: PurchaseForm) => (editing ? updatePurchaseDraft(id!, v).then(() => id!) : createPurchase(storeId, v)),
    onSuccess: pid => { void qc.invalidateQueries({ queryKey: ['purchases', storeId] }); void qc.invalidateQueries({ queryKey: ['purchase', pid] }); toast.success(editing ? 'Draft diperbarui.' : 'Pembelian disimpan sebagai draft.'); nav(`/purchases/${pid}`) },
    onError: e => toast.error(errMsg(e)),
  })
  const lines = watch('lines'); const discount = watch('discount'); const payOnReceive = watch('pay_on_receive')
  const subtotal = lines.reduce((a, l) => a + (l.quantity || 0) * (l.unit_cost || 0), 0)
  const total = Math.max(subtotal - (discount || 0), 0)
  const opts = products.map(p => ({ value: p.id, label: p.product_name, hint: p.product_code }))
  if (editing && existing.isLoading) return <Skeleton className="h-96" />

  return (
    <form onSubmit={handleSubmit(v => save.mutate(v))} className="mx-auto max-w-4xl space-y-5" noValidate>
      <Link to={editing ? `/purchases/${id}` : '/purchases'} className="link inline-flex items-center gap-1 text-sm"><ArrowLeft size={14} />Kembali</Link>
      <PageHeader title={editing ? 'Ubah draft pembelian' : 'Pembelian baru'} description="Disimpan sebagai draft. Stok bertambah setelah barang ditandai diterima." />
      <div className="card grid gap-4 sm:grid-cols-2">
        <Field label="Supplier (opsional)"><Controller control={control} name="supplier_id" render={({ field }) => <Combobox options={sups.map(s => ({ value: s.id, label: s.supplier_name }))} value={field.value ?? ''} onChange={field.onChange} emptyLabel="Tanpa supplier" placeholder="Pilih supplier" />} /></Field>
        <Field label="Tanggal pembelian" error={errors.purchase_date?.message}><Controller control={control} name="purchase_date" render={({ field }) => <DatePicker value={field.value} onChange={field.onChange} />} /></Field>
        <Field label="Metode pembayaran"><select className="input" {...register('payment_method')}><option value="cash">Tunai</option><option value="transfer">Transfer</option><option value="other">Lainnya</option></select></Field>
        <Field label="Pembayaran" hint={payOnReceive ? 'Tercatat lunas otomatis saat barang diterima.' : 'Tercatat sebagai utang supplier; bayar kapan saja dari halaman detail.'}>
          <label className="flex h-[42px] items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register('pay_on_receive')} />Bayar lunas saat barang diterima</label></Field>
        {!payOnReceive && <Field label="Jatuh tempo (opsional)"><Controller control={control} name="due_date" render={({ field }) => <DatePicker value={field.value ?? ''} onChange={field.onChange} clearable placeholder="Tanpa jatuh tempo" />} /></Field>}
        <Field label="Catatan" className={payOnReceive ? '' : ''}><input className="input" placeholder="Mis. nomor faktur supplier" {...register('notes')} /></Field>
      </div>
      <div className="card space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-bold">Barang</h2>{errors.lines?.message && <p className="text-xs text-red-600">{errors.lines.message}</p>}</div>
        <div className="hidden grid-cols-[1fr_110px_150px_130px_36px] gap-2 text-xs font-semibold text-slate-500 sm:grid"><span>Produk</span><span>Jumlah</span><span>Harga beli</span><span className="text-right">Subtotal</span><span /></div>
        {fields.map((f, i) => (
          <div key={f.id} className="grid gap-2 rounded-lg border border-slate-100 p-3 sm:grid-cols-[1fr_110px_150px_130px_36px] sm:items-start sm:border-0 sm:p-0">
            <Field error={errors.lines?.[i]?.product_id?.message}><Controller control={control} name={`lines.${i}.product_id`} render={({ field }) =>
              <Combobox options={opts} value={field.value} invalid={!!errors.lines?.[i]?.product_id} placeholder="Pilih produk"
                onChange={v => { field.onChange(v); const p = products.find(x => x.id === v); if (p && !watch(`lines.${i}.unit_cost`)) setValue(`lines.${i}.unit_cost`, p.purchase_price) }} />} /></Field>
            <Field error={errors.lines?.[i]?.quantity?.message}><input className="input" type="number" min={1} inputMode="numeric" aria-label="Jumlah" {...register(`lines.${i}.quantity`, { valueAsNumber: true })} /></Field>
            <Controller control={control} name={`lines.${i}.unit_cost`} render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} placeholder="Harga beli" />} />
            <p className="py-2.5 text-right text-sm font-semibold">{rupiah((lines[i]?.quantity || 0) * (lines[i]?.unit_cost || 0))}</p>
            <button type="button" className="grid h-10 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" disabled={fields.length === 1} onClick={() => remove(i)} aria-label="Hapus baris"><Trash2 size={16} /></button>
          </div>))}
        <button type="button" className="btn-secondary btn-sm" onClick={() => append({ product_id: '', quantity: 1, unit_cost: 0 })}><Plus size={14} />Tambah baris</button>
        <div className="ml-auto max-w-xs space-y-2 border-t border-slate-100 pt-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{rupiah(subtotal)}</span></div>
          <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Diskon</span><Controller control={control} name="discount" render={({ field }) => <MoneyInput className="w-36 py-1.5 text-right" value={field.value} onChange={field.onChange} invalid={!!errors.discount} />} /></div>
          {errors.discount && <p className="text-right text-xs text-red-600">{errors.discount.message}</p>}
          <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{rupiah(total)}</span></div>
          <p className="text-xs text-slate-400">Diskon dibagi proporsional ke tiap barang sehingga HPP mencerminkan uang yang benar-benar keluar.</p>
        </div>
      </div>
      <div className="flex justify-end gap-2"><Link to={editing ? `/purchases/${id}` : '/purchases'} className="btn-secondary">Batal</Link><button className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Simpan sebagai draft'}</button></div>
    </form>)
}
