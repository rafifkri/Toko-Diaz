import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'

type Kind = 'success' | 'error' | 'info'
interface ToastItem { id: number; kind: Kind; text: string }
interface ToastApi { success: (t: string) => void; error: (t: string) => void; info: (t: string) => void }
const Ctx = createContext<ToastApi | null>(null)

const style: Record<Kind, string> = {
  success: 'border-green-200 bg-green-50 text-green-800', error: 'border-red-200 bg-red-50 text-red-800', info: 'border-slate-200 bg-white text-slate-700',
}
const icon = { success: CheckCircle2, error: XCircle, info: Info }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)
  const dismiss = useCallback((id: number) => setItems(l => l.filter(t => t.id !== id)), [])
  const push = useCallback((kind: Kind, text: string) => {
    const id = ++seq.current
    setItems(l => [...l.slice(-3), { id, kind, text }])
    setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500)
  }, [dismiss])
  const api = useMemo<ToastApi>(() => ({ success: t => push('success', t), error: t => push('error', t), info: t => push('info', t) }), [push])
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 print:hidden" aria-live="polite">
        {items.map(t => {
          const Icon = icon[t.kind]
          return (
            <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex animate-slide-in items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${style[t.kind]}`}>
              <Icon size={18} className="mt-0.5 shrink-0" /><p className="flex-1">{t.text}</p>
              <button onClick={() => dismiss(t.id)} aria-label="Tutup" className="opacity-60 hover:opacity-100"><X size={16} /></button>
            </div>)
        })}
      </div>
    </Ctx.Provider>)
}

export function useToast(): ToastApi {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast harus dipakai di dalam ToastProvider')
  return c
}
