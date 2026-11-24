import type { ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

export const Spinner = ({ className = '' }: { className?: string }) => <Loader2 className={`animate-spin ${className}`} size={18} aria-label="Memuat" />

export const Skeleton = ({ className = '' }: { className?: string }) => <div className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />

export function PageLoader() {
  return <div className="grid min-h-[40vh] place-items-center text-brand-600"><Spinner className="h-8 w-8" /></div>
}

/** Ilustrasi sederhana untuk keadaan kosong. */
function EmptyArt() {
  return (
    <svg viewBox="0 0 120 90" className="mx-auto mb-3 h-20 w-28" aria-hidden="true">
      <ellipse cx="60" cy="80" rx="42" ry="7" fill="#e0e7ff" />
      <path d="M26 34l7-18h54l7 18v6a10 10 0 0 1-17 7 10 10 0 0 1-15 0 10 10 0 0 1-15 0 10 10 0 0 1-17-7z" fill="#c7d2fe" />
      <rect x="30" y="46" width="60" height="30" rx="3" fill="#eef2ff" stroke="#a5b4fc" strokeWidth="2" />
      <rect x="52" y="54" width="16" height="22" rx="2" fill="#818cf8" />
    </svg>)
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center"><EmptyArt />
      <p className="font-semibold text-slate-700">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>)
}

export function ErrorState({ message = 'Data gagal dimuat.', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="px-4 py-10 text-center" role="alert">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-500"><AlertTriangle size={22} /></div>
      <p className="font-semibold text-slate-700">{message}</p>
      <p className="mt-1 text-sm text-slate-500">Periksa koneksi internet Anda lalu coba lagi.</p>
      {onRetry && <button className="btn-primary mt-4" onClick={onRetry}>Coba lagi</button>}
    </div>)
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold tracking-tight">{title}</h1>{description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>)
}

const tones = {
  green: 'bg-green-50 text-green-700 ring-green-200', amber: 'bg-amber-50 text-amber-700 ring-amber-200', red: 'bg-red-50 text-red-700 ring-red-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200', blue: 'bg-blue-50 text-blue-700 ring-blue-200', indigo: 'bg-brand-50 text-brand-700 ring-brand-200',
}
export type Tone = keyof typeof tones
export const Badge = ({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) =>
  <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}>{children}</span>

export const saleStatus: Record<string, [string, Tone]> = {
  paid: ['Lunas', 'green'], pending: ['Pending', 'amber'], failed: ['Gagal', 'red'], cancelled: ['Dibatalkan', 'slate'], refunded: ['Direfund', 'blue'],
}
export const receivingStatus: Record<string, [string, Tone]> = { draft: ['Draft', 'amber'], received: ['Diterima', 'green'], cancelled: ['Dibatalkan', 'slate'] }
export const purchasePay: Record<string, [string, Tone]> = { unpaid: ['Belum lunas', 'red'], partial: ['Dicicil', 'amber'], paid: ['Lunas', 'green'] }
export const StatusBadge = ({ map, value }: { map: Record<string, [string, Tone]>; value: string }) => <Badge tone={map[value]?.[1] ?? 'slate'}>{map[value]?.[0] ?? value}</Badge>

export function StatCard({ label, value, icon, tone = 'indigo', hint }: { label: string; value: ReactNode; icon: ReactNode; tone?: 'indigo' | 'green' | 'amber' | 'red' | 'blue'; hint?: ReactNode }) {
  const t = { indigo: 'bg-brand-50 text-brand-600', green: 'bg-green-50 text-green-600', amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600', blue: 'bg-blue-50 text-blue-600' }[tone]
  return (
    <div className="card flex items-center gap-4 transition hover:shadow-md">
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${t}`}>{icon}</div>
      <div className="min-w-0"><p className="truncate text-sm text-slate-500">{label}</p><p className="truncate text-xl font-bold">{value}</p>{hint && <p className="text-xs text-slate-400">{hint}</p>}</div>
    </div>)
}

export function Field({ label, error, hint, children, className = '' }: { label?: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <span className="label">{label}</span>}
      {children}
      {error ? <p className="mt-1 text-xs text-red-600" role="alert">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>)
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 print:hidden" role="tablist">
      {tabs.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${value === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{l}</button>))}
    </div>)
}
