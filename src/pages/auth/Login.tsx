import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '../../contexts/AuthContext'
import { signIn, signUpOwner } from '../../services/auth'
import { loginSchema, registerSchema } from '../../schemas'
import { errMsg } from '../../utils/errors'
import Logo from '../../components/layout/Logo'
import { Field } from '../../components/ui/feedback'

type LoginForm = z.infer<typeof loginSchema>
type RegisterForm = z.infer<typeof registerSchema>

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-900 p-12 text-white lg:flex">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-indigo-400/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-center gap-3"><Logo size={40} /><span className="text-lg font-bold">Toko Diaz</span></div>
        <div className="relative"><h1 className="text-4xl font-bold leading-tight">Kelola kasir, stok,<br />dan keuangan toko<br />dalam satu tempat.</h1>
          <p className="mt-4 max-w-md text-indigo-200">Sistem kasir yang rapi dan mudah untuk usaha keluarga.</p></div>
        <p className="relative text-sm text-indigo-300">Toko Diaz POS</p>
      </div>
      <div className="grid place-items-center p-6">
        <div className="w-full max-w-sm animate-slide-up space-y-5">
          <div className="lg:hidden"><Logo size={44} className="rounded-xl bg-brand-900" /></div>
          <div><h2 className="text-2xl font-bold">{title}</h2><p className="text-sm text-slate-500">{subtitle}</p></div>
          {children}
        </div>
      </div>
    </div>)
}

function LoginFormView() {
  const [error, setError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })
  const submit = async (v: LoginForm) => { setError(''); try { await signIn(v.email, v.password) } catch (e) { setError(errMsg(e)) } }
  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <Field label="Email" error={errors.email?.message}><input className="input" type="email" autoComplete="email" {...register('email')} /></Field>
      <Field label="Kata sandi" error={errors.password?.message}><input className="input" type="password" autoComplete="current-password" {...register('password')} /></Field>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? 'Memproses…' : 'Masuk'}</button>
      <div className="flex justify-between text-sm"><Link to="/forgot-password" className="link">Lupa kata sandi?</Link><Link to="/register" className="link">Pemilik baru? Daftar</Link></div>
    </form>)
}

function RegisterFormView() {
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const { refresh } = useAuth()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })
  const submit = async (v: RegisterForm) => {
    setError(''); setInfo('')
    try { const done = await signUpOwner(v); if (done) await refresh(); else setInfo('Cek email Anda untuk konfirmasi, lalu masuk.') } catch (e) { setError(errMsg(e)) }
  }
  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      <Field label="Nama lengkap" error={errors.fullName?.message}><input className="input" autoComplete="name" {...register('fullName')} /></Field>
      <Field label="Nama toko" error={errors.storeName?.message}><input className="input" {...register('storeName')} /></Field>
      <Field label="Email" error={errors.email?.message}><input className="input" type="email" autoComplete="email" {...register('email')} /></Field>
      <Field label="Kata sandi" error={errors.password?.message} hint="Minimal 8 karakter."><input className="input" type="password" autoComplete="new-password" {...register('password')} /></Field>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      {info && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700" role="status">{info}</p>}
      <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? 'Memproses…' : 'Daftar'}</button>
      <p className="text-center text-sm"><Link to="/login" className="link">Sudah punya akun? Masuk</Link></p>
    </form>)
}

export default function Login({ mode = 'login' }: { mode?: 'login' | 'register' }) {
  const { session, loading, membership } = useAuth()
  if (!loading && session && membership) return <Navigate to="/" replace />
  return mode === 'login'
    ? <AuthShell title="Masuk" subtitle="Gunakan akun Toko Diaz Anda."><LoginFormView /></AuthShell>
    : <AuthShell title="Daftar sebagai pemilik" subtitle="Buat akun dan toko Anda."><RegisterFormView /></AuthShell>
}
