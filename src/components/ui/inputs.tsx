import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Calendar, ChevronLeft, ChevronRight, ChevronsUpDown, Search, X } from 'lucide-react'
import { useDismiss } from '../../hooks'
import { MONTHS_FULL, dateLabel } from '../../utils/format'
import { iso, presetRange, periodLabels, type PresetKey, type Range } from '../../utils/period'

/** Input nominal rupiah dengan pemisah ribuan. Nilai selalu bilangan bulat >= 0. */
export function MoneyInput({ value, onChange, placeholder, disabled, className = '', invalid, id }: {
  value: number | undefined; onChange: (n: number) => void; placeholder?: string; disabled?: boolean; className?: string; invalid?: boolean; id?: string
}) {
  const fmt = (n: number | undefined) => (n ? new Intl.NumberFormat('id-ID').format(n) : '')
  return (
    <input id={id} inputMode="numeric" disabled={disabled} placeholder={placeholder ?? '0'} className={`input ${invalid ? 'input-error' : ''} ${className}`} value={fmt(value)}
      onChange={e => onChange(Number(e.target.value.replace(/\D/g, '').slice(0, 12)) || 0)} onFocus={e => e.target.select()} />)
}

export function SearchInput({ value, onChange, placeholder = 'Cari…', className = '', onEnter, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; onEnter?: () => void; autoFocus?: boolean }) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
      <input className="input pl-9 pr-8" placeholder={placeholder} value={value} autoFocus={autoFocus} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter() }} aria-label={placeholder} />
      {value && <button onClick={() => onChange('')} aria-label="Hapus pencarian" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"><X size={14} /></button>}
    </div>)
}

const DOW = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

/** Pemilih tanggal kustom (kalender berbahasa Indonesia, minggu mulai Senin). Nilai: 'YYYY-MM-DD' atau ''. */
export function DatePicker({ value, onChange, placeholder = 'Pilih tanggal', min, max, clearable = false, className = '', id }: {
  value: string; onChange: (v: string) => void; placeholder?: string; min?: string; max?: string; clearable?: boolean; className?: string; id?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false))
  const base = value ? new Date(value + 'T00:00:00') : new Date()
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() })
  useEffect(() => { if (open && value) { const d = new Date(value + 'T00:00:00'); setView({ y: d.getFullYear(), m: d.getMonth() }) } }, [open, value])
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1), lead = (first.getDay() + 6) % 7, days = new Date(view.y, view.m + 1, 0).getDate()
    return [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(new Date(view.y, view.m, i + 1)))]
  }, [view])
  const shift = (d: number) => setView(v => { const n = new Date(v.y, v.m + d, 1); return { y: n.getFullYear(), m: n.getMonth() } })
  const off = (d: string) => (min && d < min) || (max && d > max)
  const today = iso(new Date())
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" id={id} className="input flex items-center justify-between gap-2 text-left" onClick={() => setOpen(o => !o)} aria-haspopup="dialog" aria-expanded={open}>
        <span className={value ? '' : 'text-slate-400'}>{value ? dateLabel(value) : placeholder}</span><Calendar size={16} className="shrink-0 text-slate-400" />
      </button>
      {open && (
        <div role="dialog" aria-label="Kalender" className="absolute z-40 mt-1 w-72 animate-pop rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="btn-ghost btn-sm" onClick={() => shift(-1)} aria-label="Bulan sebelumnya"><ChevronLeft size={16} /></button>
            <span className="text-sm font-bold">{MONTHS_FULL[view.m]} {view.y}</span>
            <button type="button" className="btn-ghost btn-sm" onClick={() => shift(1)} aria-label="Bulan berikutnya"><ChevronRight size={16} /></button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {DOW.map(d => <span key={d} className="py-1 font-semibold text-slate-400">{d}</span>)}
            {cells.map((d, i) => d ? (
              <button type="button" key={d} disabled={!!off(d)} onClick={() => { onChange(d); setOpen(false) }}
                className={`rounded-md py-1.5 text-sm transition disabled:text-slate-300 ${d === value ? 'bg-brand-600 font-bold text-white' : d === today ? 'font-bold text-brand-600 ring-1 ring-brand-200' : 'hover:bg-slate-100'}`}>{Number(d.slice(8))}</button>
            ) : <span key={`b${i}`} />)}
          </div>
          <div className="mt-2 flex justify-between border-t border-slate-100 pt-2">
            <button type="button" className="text-xs font-semibold text-brand-600" onClick={() => { onChange(today); setOpen(false) }}>Hari ini</button>
            {clearable && value && <button type="button" className="text-xs font-semibold text-slate-500" onClick={() => { onChange(''); setOpen(false) }}>Hapus</button>}
          </div>
        </div>)}
    </div>)
}

export interface PeriodValue { preset: PresetKey; range: Range }
export const initialPeriod = (preset: Exclude<PresetKey, 'custom'> = 'month'): PeriodValue => ({ preset, range: presetRange(preset) })

/** Pilihan periode: preset (hari ini s/d tahun ini) atau rentang tanggal kustom. */
export function PeriodPicker({ value, onChange, presets = ['today', 'week', '7d', 'month', 'last', 'year', 'custom'] }: {
  value: PeriodValue; onChange: (v: PeriodValue) => void; presets?: PresetKey[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <div className="flex flex-wrap gap-1.5">
        {presets.map(k => (
          <button key={k} type="button" aria-pressed={value.preset === k}
            onClick={() => onChange(k === 'custom' ? { preset: 'custom', range: value.range } : { preset: k, range: presetRange(k) })}
            className={`btn btn-sm border ${value.preset === k ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>{periodLabels[k]}</button>))}
      </div>
      {value.preset === 'custom' && (
        <div className="flex items-center gap-2">
          <DatePicker className="w-40" value={value.range[0]} max={value.range[1]} onChange={v => onChange({ preset: 'custom', range: [v, value.range[1]] })} />
          <span className="text-slate-400">s/d</span>
          <DatePicker className="w-40" value={value.range[1]} min={value.range[0]} onChange={v => onChange({ preset: 'custom', range: [value.range[0], v] })} />
        </div>)}
    </div>)
}

export interface Option { value: string; label: string; hint?: string }

/** Kotak pilih dengan pencarian dan navigasi keyboard (untuk produk/supplier yang banyak). */
export function Combobox({ options, value, onChange, placeholder = 'Pilih…', emptyLabel, disabled, invalid, className = '', id }: {
  options: Option[]; value: string; onChange: (v: string) => void; placeholder?: string; emptyLabel?: string; disabled?: boolean; invalid?: boolean; className?: string; id?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false))
  const list = useRef<HTMLUListElement>(null)
  const selected = options.find(o => o.value === value)
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = s ? options.filter(o => (o.label + ' ' + (o.hint ?? '')).toLowerCase().includes(s)) : options
    return base.slice(0, 60)
  }, [options, q])
  const items: Option[] = emptyLabel !== undefined && !q ? [{ value: '', label: emptyLabel }, ...filtered] : filtered
  useEffect(() => setCursor(0), [q, open])
  useEffect(() => { list.current?.children[cursor]?.scrollIntoView({ block: 'nearest' }) }, [cursor])
  const pick = (v: string) => { onChange(v); setOpen(false); setQ('') }
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[cursor]) pick(items[cursor].value) }
  }
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" id={id} disabled={disabled} onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
        className={`input flex items-center justify-between gap-2 text-left ${invalid ? 'input-error' : ''}`}>
        <span className={`truncate ${selected && selected.value ? '' : 'text-slate-400'}`}>{selected && selected.value ? selected.label : (selected?.label ?? placeholder)}</span>
        <ChevronsUpDown size={14} className="shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full min-w-[14rem] animate-pop rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <input autoFocus className="input mb-2 py-2" placeholder="Ketik untuk mencari…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={key} aria-label="Cari pilihan" />
          <ul ref={list} role="listbox" className="max-h-56 overflow-y-auto">
            {items.length === 0 && <li className="px-3 py-3 text-center text-sm text-slate-400">Tidak ditemukan</li>}
            {items.map((o, i) => (
              <li key={o.value || '_'} role="option" aria-selected={o.value === value} onMouseEnter={() => setCursor(i)} onClick={() => pick(o.value)}
                className={`cursor-pointer rounded-md px-3 py-2 text-sm ${i === cursor ? 'bg-brand-50' : ''} ${o.value === value ? 'font-semibold text-brand-700' : ''}`}>
                {o.label}{o.hint && <span className="ml-2 text-xs text-slate-400">{o.hint}</span>}</li>))}
          </ul>
        </div>)}
    </div>)
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3 print:hidden">{children}</div>
}
