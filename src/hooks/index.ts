import { useEffect, useRef, useState } from 'react'

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

/** State yang disimpan di localStorage (mis. keranjang kasir agar tidak hilang saat refresh). */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const read = (): T => {
    try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : initial } catch { return initial }
  }
  const [state, setState] = useState<T>(read)
  const keyRef = useRef(key)
  useEffect(() => {
    if (keyRef.current !== key) { keyRef.current = key; setState(read()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)) } catch { /* penyimpanan penuh/diblokir: abaikan */ } }, [key, state])
  return [state, setState]
}

/** Menutup elemen saat klik di luar atau tekan Escape. */
export function useDismiss<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!open) return
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', click); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key) }
  }, [open, onClose])
  return ref
}
