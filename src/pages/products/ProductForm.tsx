import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Modal from '../../components/ui/Modal'
import { Field } from '../../components/ui/feedback'
import { MoneyInput } from '../../components/ui/inputs'
import { useStore } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useCategories, useStoreSettings } from '../../hooks/queries'
import { productSchema, type ProductForm as Form } from '../../schemas'
import { createProduct, updateProduct } from '../../services/products'
import { validateImage } from '../../services/storage'
import { errMsg } from '../../utils/errors'
import type { ProductRow } from '../../types'

/** Form tambah/ubah produk: kategori, barcode, foto, dan (saat tambah) stok awal beserta HPP. */
export default function ProductForm({ product, onClose }: { product: ProductRow | null; onClose: () => void }) {
  const { storeId } = useStore()
  const toast = useToast()
  const qc = useQueryClient()
  const { data: cats = [] } = useCategories()
  const { data: settings } = useStoreSettings()
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoErr, setPhotoErr] = useState('')
  const editing = !!product
  const { register, handleSubmit, control, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(productSchema),
    defaultValues: product ? {
      product_code: product.product_code, product_name: product.product_name, unit: product.unit, selling_price: product.selling_price,
      minimum_stock: product.minimum_stock, barcode: product.barcode ?? '', category_id: product.category_id ?? '',
    } : { product_code: '', product_name: '', unit: settings?.default_unit ?? 'pcs', selling_price: 0, minimum_stock: settings?.default_minimum_stock ?? 0, barcode: '', category_id: '', initial_stock: 0, initial_cost: 0 },
  })
  const save = useMutation({
    mutationFn: (v: Form) => (product ? updateProduct(storeId, product.id, v, photo) : createProduct(storeId, v, photo).then(() => undefined)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products', storeId] }); void qc.invalidateQueries({ queryKey: ['product', product?.id] }); void qc.invalidateQueries({ queryKey: ['product-options', storeId] })
      toast.success(editing ? 'Produk diperbarui.' : 'Produk ditambahkan.'); onClose()
    },
    onError: (e: unknown) => toast.error((e as { code?: string })?.code === '23505' ? 'Kode produk atau barcode sudah dipakai.' : errMsg(e, 'Produk gagal disimpan.')),
  })
  const onPhoto = (f: File | undefined) => { if (!f) return; const m = validateImage(f); setPhotoErr(m ?? ''); setPhoto(m ? null : f) }
  return (
    <Modal open onClose={onClose} title={editing ? `Ubah produk ${product.product_code}` : 'Tambah produk'} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Batal</button><button className="btn-primary" disabled={save.isPending} form="product-form" type="submit">{save.isPending ? 'Menyimpan…' : 'Simpan'}</button></>}>
      <form id="product-form" onSubmit={handleSubmit(v => save.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Kode produk" error={errors.product_code?.message}><input className="input" disabled={editing} {...register('product_code')} /></Field>
        <Field label="Nama produk" error={errors.product_name?.message}><input className="input" {...register('product_name')} /></Field>
        <Field label="Kategori"><select className="input" {...register('category_id')}><option value="">Tanpa kategori</option>{cats.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}</select></Field>
        <Field label="Barcode (opsional)" error={errors.barcode?.message}><input className="input" inputMode="numeric" {...register('barcode')} /></Field>
        <Field label="Harga jual" error={errors.selling_price?.message}><Controller control={control} name="selling_price" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} invalid={!!errors.selling_price} />} /></Field>
        <Field label="Satuan" error={errors.unit?.message}><input className="input" placeholder="pcs, kg, liter…" {...register('unit')} /></Field>
        <Field label="Stok minimum" error={errors.minimum_stock?.message} hint="Peringatan stok menipis muncul pada angka ini."><Controller control={control} name="minimum_stock" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} />} /></Field>
        <Field label="Foto produk (PNG/JPG, maks 2 MB)" error={photoErr}><input type="file" accept="image/png,image/jpeg" className="block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-semibold file:text-brand-700" onChange={e => onPhoto(e.target.files?.[0])} /></Field>
        {!editing && (
          <div className="rounded-lg bg-slate-50 p-3 sm:col-span-2">
            <p className="mb-2 text-xs font-semibold text-slate-600">Stok awal (opsional)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Jumlah"><Controller control={control} name="initial_stock" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} />} /></Field>
              <Field label="HPP per satuan" hint="Dipakai menghitung laba. Isi harga modal barang."><Controller control={control} name="initial_cost" render={({ field }) => <MoneyInput value={field.value} onChange={field.onChange} />} /></Field>
            </div>
            <p className="mt-2 text-xs text-slate-500">Setelah ini, stok bertambah lewat menu Pembelian atau Stok agar tercatat di riwayat.</p>
          </div>)}
      </form>
    </Modal>)
}
