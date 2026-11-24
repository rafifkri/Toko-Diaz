import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import Modal from '../components/ui/Modal'

interface ConfirmOpts { title: string; message?: ReactNode; confirmText?: string; cancelText?: string; danger?: boolean }
interface PromptOpts extends ConfirmOpts { label: string; placeholder?: string; required?: boolean; defaultValue?: string }
interface DialogApi { confirm: (o: ConfirmOpts) => Promise<boolean>; prompt: (o: PromptOpts) => Promise<string | null> }
const Ctx = createContext<DialogApi | null>(null)

type State = { kind: 'confirm'; o: ConfirmOpts } | { kind: 'prompt'; o: PromptOpts } | null

/** Pengganti confirm()/prompt() bawaan browser: dapat ditata, ramah layar sentuh, dan berbasis promise. */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(null)
  const [text, setText] = useState('')
  const resolver = useRef<((v: boolean | string | null) => void) | null>(null)

  const open = useCallback(<T extends boolean | string | null>(s: NonNullable<State>) =>
    new Promise<T>(res => { resolver.current = res as (v: boolean | string | null) => void; setText(s.kind === 'prompt' ? s.o.defaultValue ?? '' : ''); setState(s) }), [])
  const api = useMemo<DialogApi>(() => ({
    confirm: o => open<boolean>({ kind: 'confirm', o }),
    prompt: o => open<string | null>({ kind: 'prompt', o }),
  }), [open])

  const close = (v: boolean | string | null) => { resolver.current?.(v); resolver.current = null; setState(null) }
  const o = state?.o
  const isPrompt = state?.kind === 'prompt'
  const blocked = isPrompt && (state.o.required ?? true) && !text.trim()
  const submit = () => { if (blocked) return; close(isPrompt ? text.trim() : true) }

  return (
    <Ctx.Provider value={api}>
      {children}
      <Modal open={!!state} onClose={() => close(isPrompt ? null : false)} title={o?.title ?? ''} size="sm"
        footer={<>
          <button className="btn-secondary" onClick={() => close(isPrompt ? null : false)}>{o?.cancelText ?? 'Batal'}</button>
          <button className={o?.danger ? 'btn-danger' : 'btn-primary'} disabled={blocked} onClick={submit}>{o?.confirmText ?? (isPrompt ? 'Simpan' : 'Ya, lanjutkan')}</button></>}>
        {o?.message && <div className="text-sm text-slate-600">{o.message}</div>}
        {isPrompt && (
          <div className={o?.message ? 'mt-3' : ''}>
            <label className="label" htmlFor="dialog-input">{state.o.label}</label>
            <input id="dialog-input" autoFocus className="input" placeholder={state.o.placeholder} value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit() }} />
          </div>)}
      </Modal>
    </Ctx.Provider>)
}

export function useDialog(): DialogApi {
  const c = useContext(Ctx)
  if (!c) throw new Error('useDialog harus dipakai di dalam DialogProvider')
  return c
}
