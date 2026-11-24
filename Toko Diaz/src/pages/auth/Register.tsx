import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '../../contexts/AuthContext'
import { signUp } from '../../services/auth'
import { registerSchema } from '../../schemas'
import { Field } from '../../components/ui/feedback'
import { AuthShell } from './Login'

type RegisterForm = z.infer<typeof registerSchema>

function RegisterFormView() {
  const [error, setError] = useState('')
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })
  const submit = async (v: RegisterForm) => {
    setError('')
    try {
      const active = await signUp(v.full_name.trim(), v.email.trim(), v.password)
      // Sesi aktif: AuthContext mengalihkan otomatis. Tanpa sesi: menunggu konfirmasi email.
      if (!active) setNeedsConfirm(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'Pendaftaran gagal. Coba lagi.') }
  }
  if (needsConfirm) {
    return <p className="rounded-lg bg-green-50 px-3 py-3 text-sm text-green-700" role="status">Pendaftaran berhasil. Periksa email Anda untuk konfirmasi, lalu masuk.</p>
  }
  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <Field label="Nama lengkap" error={errors.full_name?.message}><input className="input" autoComplete="name" {...register('full_name')} /></Field>
      <Field label="Email" error={errors.email?.message}><input className="input" type="email" autoComplete="email" {...register('email')} /></Field>
      <Field label="Kata sandi" error={errors.password?.message}><input className="input" type="password" autoComplete="new-password" {...register('password')} /></Field>
      <Field label="Ulangi kata sandi" error={errors.confirm?.message}><input className="input" type="password" autoComplete="new-password" {...register('confirm')} /></Field>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? 'Memproses…' : 'Daftar'}</button>
    </form>)
}

export default function Register() {
  const { session, loading } = useAuth()
  if (!loading && session) return <Navigate to="/" replace />
  return (
    <AuthShell title="Daftar" subtitle="Buat akun pemilik untuk Toko Diaz.">
      <RegisterFormView />
      <p className="text-sm text-slate-500">Sudah punya akun? <Link to="/login" className="link">Masuk</Link></p>
    </AuthShell>)
}
