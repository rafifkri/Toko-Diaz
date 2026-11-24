import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useStore } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDialog } from '../../contexts/DialogContext'
import { categorySchema, type CategoryForm } from '../../schemas'
import { createCategory, deleteCategory, listCategories, updateCategory } from '../../services/master'
import DataTable, { type Column } from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import { Field, PageHeader } from '../../components/ui/feedback'
import { SearchInput } from '../../components/ui/inputs'
import { errMsg } from '../../utils/errors'
import type { Category } from '../../types'

function CategoryModal({ item, onClose }: { item: Category | null; onClose: () => void }) {
  const { storeId } = useStore(); const toast = useToast(); const qc = useQueryClient()
  const { register, handleSubmit, formState: { errors } } = useForm<CategoryForm>({ resolver: zodResolver(categorySchema), defaultValues: { category_name: item?.category_name ?? '', description: item?.description ?? '' } })
  const save = useMutation({
    mutationFn: (v: CategoryForm) => (item ? updateCategory(item.id, v) : createCategory(storeId, v)),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['categories', storeId] }); toast.success(item ? 'Kategori diperbarui.' : 'Kategori ditambahkan.'); onClose() },
    onError: e => toast.error(errMsg(e)),
  })
  return (
    <Modal open onClose={onClose} title={item ? 'Ubah kategori' : 'Tambah kategori'} size="sm"
      footer={<><button className="btn-secondary" onClick={onClose}>Batal</button><button className="btn-primary" form="cat-form" disabled={save.isPending}>Simpan</button></>}>
      <form id="cat-form" onSubmit={handleSubmit(v => save.mutate(v))} className="space-y-4" noValidate>
        <Field label="Nama kategori" error={errors.category_name?.message}><input className="input" {...register('category_name')} /></Field>
        <Field label="Deskripsi (opsional)"><input className="input" {...register('description')} /></Field>
      </form>
    </Modal>)
}

export default function Categories() {
  const { storeId } = useStore(); const toast = useToast(); const dialog = useDialog(); const qc = useQueryClient()
  const [q, setQ] = useState(''); const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['categories', storeId], queryFn: () => listCategories(storeId) })
  const rows = (data ?? []).filter(c => (c.category_name + (c.description ?? '')).toLowerCase().includes(q.toLowerCase()))
  const remove = async (c: Category) => {
    if (!(await dialog.confirm({ title: `Hapus kategori "${c.category_name}"?`, message: 'Produk di kategori ini akan menjadi tanpa kategori.', confirmText: 'Hapus', danger: true }))) return
    try { await deleteCategory(c.id); void qc.invalidateQueries({ queryKey: ['categories', storeId] }); toast.success('Kategori dihapus.') } catch (e) { toast.error(errMsg(e)) }
  }
  const columns: Column<Category>[] = [
    { key: 'n', header: 'Nama kategori', cell: c => <b>{c.category_name}</b> },
    { key: 'd', header: 'Deskripsi', cell: c => c.description ?? <span className="text-slate-400">-</span> },
    { key: 'a', header: '', align: 'right', cell: c => <span className="space-x-3"><button className="link" onClick={() => setEditing(c)}>Ubah</button><button className="text-red-600 hover:underline" onClick={() => void remove(c)}>Hapus</button></span> },
  ]
  return (
    <div className="space-y-5">
      {editing && <CategoryModal item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <PageHeader title="Kategori" description="Kelompokkan produk agar mudah dicari dan dilaporkan." actions={<button className="btn-primary" onClick={() => setEditing('new')}><Plus size={16} />Tambah kategori</button>} />
      <SearchInput className="max-w-sm" value={q} onChange={setQ} placeholder="Cari kategori" />
      <DataTable columns={columns} rows={rows} rowKey={c => c.id} loading={isLoading} error={isError} onRetry={() => void refetch()}
        empty={{ title: 'Belum ada kategori', description: 'Buat kategori seperti Minuman, Sembako, atau Snack.', action: <button className="btn-primary" onClick={() => setEditing('new')}>Tambah kategori</button> }} />
    </div>)
}
