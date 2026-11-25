import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { forgotSchema, newPasswordSchema } from '../../schemas'
import { sendResetEmail, updatePassword } from '../../services/auth'
import { errMsg } from '../../utils/errors'
import { appUrl } from '../../lib/paths'
import { Field } from '../../components/ui/feedback'
import { useToast } from '../../contexts/ToastContext'
import { AuthShell } from './Login'

export function ForgotPassword() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) })
  const submit = async (v: { email: string }) => { setError(''); try { await sendResetEmail(v.email); setSent(true) } catch (e) { setError(errMsg(e)) } }
  return (
    <AuthShell title="Lupa kata sandi" subtitle="Kami kirim tautan untuk membuat kata sandi baru.">
      {sent ? <p className="rounded-lg bg-green-50 px-3 py-3 text-sm text-green-700" role="status">Jika email terdaftar, tautan reset sudah dikirim. Periksa kotak masuk Anda.</p> : (
        <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
          <Field label="Email" error={errors.email?.message}><input className="input" type="email" autoComplete="email" {...register('email')} /></Field>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
          <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? 'Mengirim…' : 'Kirim tautan reset'}</button>
        </form>)}
      <p className="text-center text-sm"><Link to="/login" className="link">Kembali ke halaman masuk</Link></p>
    </AuthShell>)
}

export function ResetPassword() {
  const toast = useToast()
  const [error, setError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof newPasswordSchema>>({ resolver: zodResolver(newPasswordSchema) })
  const submit = async (v: { password: string }) => {
    setError('')
    try { await updatePassword(v.password); toast.success('Kata sandi diperbarui.'); window.location.assign(appUrl()) }
    catch (e) {
      const m = e instanceof Error ? e.message : ''
      setError(/session missing/i.test(m) ? 'Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru dari halaman Lupa kata sandi.' : errMsg(e))
    }
  }
  return (
    <AuthShell title="Buat kata sandi baru" subtitle="Masukkan kata sandi baru untuk akun Anda.">
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <Field label="Kata sandi baru" error={errors.password?.message}><input className="input" type="password" autoComplete="new-password" {...register('password')} /></Field>
        <Field label="Ulangi kata sandi" error={errors.confirm?.message}><input className="input" type="password" autoComplete="new-password" {...register('confirm')} /></Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? 'Menyimpan…' : 'Simpan kata sandi'}</button>
      </form>
    </AuthShell>)
}
