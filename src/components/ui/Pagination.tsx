import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ page, total, size, onChange }: { page: number; total: number; size: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size))
  if (total === 0) return null
  const from = (page - 1) * size + 1, to = Math.min(page * size, total)
  const nums: (number | '…')[] = []
  for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p); else if (nums[nums.length - 1] !== '…') nums.push('…')
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm print:hidden">
      <span className="text-slate-500">Menampilkan {from}–{to} dari {total}</span>
      {pages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Paginasi">
          <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Sebelumnya"><ChevronLeft size={16} /></button>
          {nums.map((n, i) => n === '…' ? <span key={`e${i}`} className="px-1 text-slate-400">…</span> :
            <button key={n} onClick={() => onChange(n)} aria-current={n === page ? 'page' : undefined}
              className={`btn btn-sm min-w-8 ${n === page ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{n}</button>)}
          <button className="btn-ghost btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Berikutnya"><ChevronRight size={16} /></button>
        </nav>)}
    </div>)
}
