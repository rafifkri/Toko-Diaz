import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useStore } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDebounced } from '../../hooks'
import { supplierSchema, type SupplierForm } from '../../schemas'
import { createSupplier, listSuppliers, setSupplierActive, updateSupplier } from '../../services/master'
import DataTable, { type Column } from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import { Badge, Field, PageHeader } from '../../components/ui/feedback'
import { SearchInput } from '../../components/ui/inputs'
import { errMsg } from '../../utils/errors'
import type { Supplier } from '../../types'

export function SupplierModal({ item, onClose }: { item: Supplier | null; onClose: () => void }) {
  const { storeId } = useStore(); const toast = useToast(); const qc = useQueryClient()
  const { register, handleSubmit, formState: { errors } } = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { supplier_name: item?.supplier_name ?? '', phone: item?.phone ?? '', contact_person: item?.contact_person ?? '', address: item?.address ?? '', notes: item?.notes ?? '' },
  })
  const save = useMutation({
    mutationFn: (v: SupplierForm) => (item ? updateSupplier(item.id, v) : createSupplier(storeId, v)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['suppliers', storeId] }); void qc.invalidateQueries({ queryKey: ['supplier', item?.id] }); void qc.invalidateQueries({ queryKey: ['supplier-options', storeId] })
      toast.success(item ? 'Supplier diperbarui.' : 'Supplier ditambahkan.'); onClose()
    },
    onError: e => toast.error(errMsg(e)),
  })
  return (
    <Modal open onClose={onClose} title={item ? 'Ubah supplier' : 'Tambah supplier'}
      footer={<><button className="btn-secondary" onClick={onClose}>Batal</button><button className="btn-primary" form="sup-form" disabled={save.isPending}>Simpan</button></>}>
      <form id="sup-form" onSubmit={handleSubmit(v => save.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Nama supplier" error={errors.supplier_name?.message} className="sm:col-span-2"><input className="input" {...register('supplier_name')} /></Field>
        <Field label="Telepon"><input className="input" inputMode="tel" {...register('phone')} /></Field>
        <Field label="Kontak"><input className="input" {...register('contact_person')} /></Field>
        <Field label="Alamat" className="sm:col-span-2"><input className="input" {...register('address')} /></Field>
        <Field label="Catatan" className="sm:col-span-2"><input className="input" {...register('notes')} /></Field>
      </form>
    </Modal>)
}

const SIZE = 15
export default function Suppliers() {
  const { storeId } = useStore(); const toast = useToast(); const qc = useQueryClient()
  const [search, setSearch] = useState(''); const [page, setPage] = useState(1); const [editing, setEditing] = useState<Supplier | 'new' | null>(null)
  const q = useDebounced(search)
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['suppliers', storeId, q, page], queryFn: () => listSuppliers(storeId, q, page, SIZE), placeholderData: prev => prev })
  const toggle = useMutation({
    mutationFn: (s: Supplier) => setSupplierActive(s.id, !s.is_active),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['suppliers', storeId] }), onError: e => toast.error(errMsg(e)),
  })
  const columns: Column<Supplier>[] = [
    { key: 'n', header: 'Supplier', cell: s => <Link to={`/suppliers/${s.id}`} className="font-semibold hover:text-brand-600">{s.supplier_name}</Link> },
    { key: 'p', header: 'Telepon', cell: s => s.phone ?? '-' },
    { key: 'c', header: 'Kontak', cell: s => s.contact_person ?? '-' },
    { key: 'a', header: 'Alamat', className: 'max-w-xs truncate', cell: s => s.address ?? '-' },
    { key: 's', header: 'Status', cell: s => <Badge tone={s.is_active ? 'green' : 'slate'}>{s.is_active ? 'Aktif' : 'Nonaktif'}</Badge> },
    { key: 'x', header: '', align: 'right', cell: s => <span className="space-x-3 whitespace-nowrap"><button className="link" onClick={() => setEditing(s)}>Ubah</button><button className="text-slate-500 hover:underline" onClick={() => toggle.mutate(s)}>{s.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button></span> },
  ]
  return (
    <div className="space-y-5">
      {editing && <SupplierModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <PageHeader title="Supplier" description="Pemasok barang dan riwayat pembeliannya." actions={<button className="btn-primary" onClick={() => setEditing('new')}><Plus size={16} />Tambah supplier</button>} />
      <SearchInput className="max-w-sm" value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Cari nama supplier" />
      <DataTable columns={columns} rows={data?.rows} rowKey={s => s.id} loading={isLoading} error={isError} onRetry={() => void refetch()}
        page={page} size={SIZE} total={data?.total} onPage={setPage}
        empty={{ title: 'Belum ada supplier', description: 'Catat pemasok agar pembelian dan utang mudah dilacak.', action: <button className="btn-primary" onClick={() => setEditing('new')}>Tambah supplier</button> }} />
    </div>)
}
