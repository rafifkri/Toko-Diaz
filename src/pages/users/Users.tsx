import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, UserPlus } from 'lucide-react'
import { useStore } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDialog } from '../../contexts/DialogContext'
import { cashierSchema, newPasswordSchema, type CashierForm } from '../../schemas'
import { createCashier, listMembers, resetCashierPassword, setMemberActive, setMemberRole } from '../../services/users'
import DataTable, { type Column } from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import { Badge, Field, PageHeader } from '../../components/ui/feedback'
import { errMsg } from '../../utils/errors'
import type { Member, Role } from '../../types'
import type { z } from 'zod'

function AddModal({ onClose }: { onClose: () => void }) {
  const { storeId } = useStore(); const toast = useToast(); const qc = useQueryClient()
  const { register, handleSubmit, formState: { errors } } = useForm<CashierForm>({ resolver: zodResolver(cashierSchema) })
  const save = useMutation({ mutationFn: (v: CashierForm) => createCashier(storeId, v),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['members', storeId] }); toast.success('Akun kasir dibuat.'); onClose() }, onError: e => toast.error(errMsg(e)) })
  return (
    <Modal open onClose={onClose} title="Tambah kasir" size="sm" footer={<><button className="btn-secondary" onClick={onClose}>Batal</button><button className="btn-primary" form="cashier-form" disabled={save.isPending}>{save.isPending ? 'Membuat…' : 'Buat akun'}</button></>}>
      <form id="cashier-form" onSubmit={handleSubmit(v => save.mutate(v))} className="space-y-4" noValidate>
        <Field label="Nama lengkap" error={errors.full_name?.message}><input className="input" {...register('full_name')} /></Field>
        <Field label="Email" error={errors.email?.message}><input className="input" type="email" {...register('email')} /></Field>
        <Field label="Kata sandi awal" error={errors.password?.message} hint="Minimal 8 karakter. Sampaikan ke kasir; ia dapat menggantinya di Profil."><input className="input" type="text" autoComplete="off" {...register('password')} /></Field>
      </form>
    </Modal>)
}

type NewPw = z.infer<typeof newPasswordSchema>
function ResetModal({ m, onClose }: { m: Member; onClose: () => void }) {
  const { storeId } = useStore(); const toast = useToast()
  const { register, handleSubmit, formState: { errors } } = useForm<NewPw>({ resolver: zodResolver(newPasswordSchema) })
  const save = useMutation({ mutationFn: (v: NewPw) => resetCashierPassword(storeId, m.user_id, v.password), onSuccess: () => { toast.success('Kata sandi diganti.'); onClose() }, onError: e => toast.error(errMsg(e)) })
  return (
    <Modal open onClose={onClose} title={`Reset kata sandi: ${m.profiles?.full_name ?? m.profiles?.email}`} size="sm" footer={<><button className="btn-secondary" onClick={onClose}>Batal</button><button className="btn-primary" form="reset-form" disabled={save.isPending}>Simpan</button></>}>
      <form id="reset-form" onSubmit={handleSubmit(v => save.mutate(v))} className="space-y-4" noValidate>
        <Field label="Kata sandi baru" error={errors.password?.message}><input className="input" type="text" autoComplete="off" {...register('password')} /></Field>
        <Field label="Ulangi kata sandi" error={errors.confirm?.message}><input className="input" type="text" autoComplete="off" {...register('confirm')} /></Field>
      </form>
    </Modal>)
}

export default function Users() {
  const { storeId, userId } = useStore(); const toast = useToast(); const dialog = useDialog(); const qc = useQueryClient()
  const [add, setAdd] = useState(false); const [reset, setReset] = useState<Member | null>(null)
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['members', storeId], queryFn: () => listMembers(storeId) })
  const refresh = () => void qc.invalidateQueries({ queryKey: ['members', storeId] })
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); refresh(); toast.success(ok) } catch (e) { toast.error(errMsg(e)) } }
  const toggle = async (m: Member) => {
    if (m.is_active && !(await dialog.confirm({ title: 'Nonaktifkan pengguna?', message: `${m.profiles?.full_name ?? m.profiles?.email} tidak akan bisa masuk ke toko ini.`, confirmText: 'Nonaktifkan', danger: true }))) return
    await run(() => setMemberActive(m.id, !m.is_active), m.is_active ? 'Pengguna dinonaktifkan.' : 'Pengguna diaktifkan.')
  }
  const changeRole = async (m: Member, role: Role) => {
    if (!(await dialog.confirm({ title: 'Ubah role?', message: role === 'owner' ? 'Owner dapat melihat laba, mengubah harga, stok, dan pengguna.' : 'Pengguna ini hanya akan bisa memakai kasir dan riwayat transaksinya.', confirmText: 'Ubah role' }))) return
    await run(() => setMemberRole(m.id, role), 'Role diperbarui.')
  }
  const cols: Column<Member>[] = [
    { key: 'n', header: 'Nama', cell: m => <b>{m.profiles?.full_name ?? '-'}{m.user_id === userId && <span className="ml-2 text-xs font-normal text-slate-400">(Anda)</span>}</b> },
    { key: 'e', header: 'Email', cell: m => m.profiles?.email ?? '-' },
    { key: 'r', header: 'Role', cell: m => <Badge tone={m.role === 'owner' ? 'indigo' : 'slate'}>{m.role === 'owner' ? 'Owner' : 'Kasir'}</Badge> },
    { key: 's', header: 'Status', cell: m => <Badge tone={m.is_active ? 'green' : 'red'}>{m.is_active ? 'Aktif' : 'Nonaktif'}</Badge> },
    { key: 'a', header: '', align: 'right', cell: m => m.user_id === userId ? null : (
      <span className="space-x-3 whitespace-nowrap">
        {m.role === 'cashier' && <button className="link inline-flex items-center gap-1" onClick={() => setReset(m)}><KeyRound size={13} />Reset sandi</button>}
        <button className="link" onClick={() => void changeRole(m, m.role === 'owner' ? 'cashier' : 'owner')}>Jadikan {m.role === 'owner' ? 'kasir' : 'owner'}</button>
        <button className="text-slate-500 hover:underline" onClick={() => void toggle(m)}>{m.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button></span>) },
  ]
  return (
    <div className="space-y-5">
      {add && <AddModal onClose={() => setAdd(false)} />}{reset && <ResetModal m={reset} onClose={() => setReset(null)} />}
      <PageHeader title="Pengguna" description="Kasir hanya melihat menu kasir dan transaksinya sendiri." actions={<button className="btn-primary" onClick={() => setAdd(true)}><UserPlus size={16} />Tambah kasir</button>} />
      <DataTable columns={cols} rows={data} rowKey={m => m.id} loading={isLoading} error={isError} onRetry={() => void refetch()} empty={{ title: 'Belum ada pengguna' }} />
    </div>)
}
