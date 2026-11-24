import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { useStore } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { getMyProfile, updateMyProfile, updatePassword } from '../../services/auth'
import { newPasswordSchema, profileSchema } from '../../schemas'
import { Field, PageHeader, Skeleton } from '../../components/ui/feedback'
import { errMsg } from '../../utils/errors'

type ProfileForm = z.infer<typeof profileSchema>
type PwForm = z.infer<typeof newPasswordSchema>

export default function Profile() {
  const { userId, email, role, storeName } = useStore(); const toast = useToast(); const qc = useQueryClient(); const [pwKey, setPwKey] = useState(0)
  const { data, isLoading } = useQuery({ queryKey: ['profile', userId], queryFn: () => getMyProfile(userId) })
  const pf = useForm<ProfileForm>({ resolver: zodResolver(profileSchema), defaultValues: { full_name: '', phone: '' } })
  useEffect(() => { if (data) pf.reset({ full_name: data.full_name ?? '', phone: data.phone ?? '' }) }, [data, pf])
  const saveProfile = useMutation({ mutationFn: (v: ProfileForm) => updateMyProfile(userId, { full_name: v.full_name, phone: v.phone?.trim() || null }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['profile', userId] }); toast.success('Profil diperbarui.') }, onError: e => toast.error(errMsg(e)) })
  const pw = useForm<PwForm>({ resolver: zodResolver(newPasswordSchema), defaultValues: { password: '', confirm: '' } })
  const savePw = useMutation({ mutationFn: (v: PwForm) => updatePassword(v.password), onSuccess: () => { toast.success('Kata sandi diganti.'); pw.reset(); setPwKey(k => k + 1) }, onError: e => toast.error(errMsg(e)) })
  if (isLoading) return <Skeleton className="h-72" />
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Profil saya" description={`${storeName} · ${role === 'owner' ? 'Owner' : 'Kasir'}`} />
      <form onSubmit={pf.handleSubmit(v => saveProfile.mutate(v))} className="card space-y-4" noValidate>
        <h2 className="font-bold">Data diri</h2>
        <Field label="Email" hint="Email tidak dapat diubah di sini."><input className="input" value={email} disabled /></Field>
        <Field label="Nama lengkap" error={pf.formState.errors.full_name?.message}><input className="input" {...pf.register('full_name')} /></Field>
        <Field label="Telepon"><input className="input" inputMode="tel" {...pf.register('phone')} /></Field>
        <button className="btn-primary" disabled={saveProfile.isPending}>Simpan profil</button>
      </form>
      <form key={pwKey} onSubmit={pw.handleSubmit(v => savePw.mutate(v))} className="card space-y-4" noValidate>
        <h2 className="font-bold">Ganti kata sandi</h2>
        <Field label="Kata sandi baru" error={pw.formState.errors.password?.message} hint="Minimal 8 karakter."><input className="input" type="password" autoComplete="new-password" {...pw.register('password')} /></Field>
        <Field label="Ulangi kata sandi" error={pw.formState.errors.confirm?.message}><input className="input" type="password" autoComplete="new-password" {...pw.register('confirm')} /></Field>
        <button className="btn-primary" disabled={savePw.isPending}>Ganti kata sandi</button>
      </form>
    </div>)
}
