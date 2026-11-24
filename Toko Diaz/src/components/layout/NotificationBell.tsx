import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { getLowStock } from '../../services/dashboard'
import { useDismiss } from '../../hooks'
import { useStore } from '../../contexts/AuthContext'

/** Ikon notifikasi di header: daftar stok menipis atau habis (khusus owner). */
export default function NotificationBell() {
  const { storeId } = useStore()
  const [open, setOpen] = useState(false)
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false))
  const { data } = useQuery({ queryKey: ['low-stock', storeId], queryFn: () => getLowStock(storeId, 8), refetchInterval: 120_000 })
  const n = data?.count ?? 0
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={`Notifikasi, ${n} stok menipis`} aria-expanded={open}>
        <Bell size={20} />
        {n > 0 && <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{n > 99 ? '99+' : n}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] animate-pop rounded-xl border border-slate-200 bg-white shadow-xl">
          <p className="border-b border-slate-100 px-4 py-3 text-sm font-bold">Stok menipis {n > 0 && <span className="text-red-500">({n})</span>}</p>
          {n === 0 ? <p className="px-4 py-6 text-center text-sm text-slate-500">Semua stok aman.</p> : (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {data?.items.map(i => (
                <li key={i.id}><Link to={`/products/${i.id}`} onClick={() => setOpen(false)} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50">
                  <span className="truncate pr-2">{i.name}</span>
                  <span className={`shrink-0 font-semibold ${i.stock <= 0 ? 'text-red-600' : 'text-amber-600'}`}>{i.stock <= 0 ? 'Habis' : `${i.stock} ${i.unit}`}</span></Link></li>))}
            </ul>)}
          {n > 0 && <Link to="/products?stock=low" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-semibold text-brand-600 hover:bg-slate-50">Lihat semua</Link>}
        </div>)}
    </div>)
}
