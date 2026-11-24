import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3, Boxes, ChevronDown, History, LayoutDashboard, LogOut, Menu, Package, Receipt, ScanLine, Settings, ShoppingCart, Tags, Truck, UserCircle, Users, Wallet, X,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useDismiss } from '../../hooks'
import Logo from './Logo'
import NotificationBell from './NotificationBell'

interface NavItem { to: string; label: string; icon: typeof Package; owner?: boolean }
const nav: NavItem[] = [
  { to: '/', label: 'Beranda', icon: LayoutDashboard },
  { to: '/pos', label: 'Kasir', icon: ScanLine },
  { to: '/sales', label: 'Riwayat Penjualan', icon: Receipt },
  { to: '/products', label: 'Produk', icon: Package, owner: true },
  { to: '/categories', label: 'Kategori', icon: Tags, owner: true },
  { to: '/suppliers', label: 'Supplier', icon: Truck, owner: true },
  { to: '/purchases', label: 'Pembelian', icon: ShoppingCart, owner: true },
  { to: '/inventory', label: 'Stok', icon: Boxes, owner: true },
  { to: '/expenses', label: 'Pengeluaran', icon: Wallet, owner: true },
  { to: '/reports', label: 'Laporan', icon: BarChart3, owner: true },
  { to: '/users', label: 'Pengguna', icon: Users, owner: true },
  { to: '/audit', label: 'Log Aktivitas', icon: History, owner: true },
  { to: '/settings', label: 'Pengaturan', icon: Settings, owner: true },
]

function StoreSwitcher() {
  const { membership, memberships, switchStore } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false))
  if (!membership) return null
  if (memberships.length < 2) return <p className="text-sm font-semibold">{membership.store_name}</p>
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1 text-sm font-semibold" aria-haspopup="listbox" aria-expanded={open}>{membership.store_name}<ChevronDown size={14} /></button>
      {open && (
        <ul role="listbox" className="absolute left-0 z-40 mt-2 w-56 animate-pop rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {memberships.map(m => (
            <li key={m.store_id}><button role="option" aria-selected={m.store_id === membership.store_id} onClick={() => { switchStore(m.store_id); setOpen(false) }}
              className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-slate-50 ${m.store_id === membership.store_id ? 'font-bold text-brand-700' : ''}`}>
              {m.store_name}<span className="text-xs capitalize text-slate-400">{m.role}</span></button></li>))}
        </ul>)}
    </div>)
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { membership, session, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const owner = membership?.role === 'owner'
  const items = nav.filter(n => !n.owner || owner)
  const current = items.find(n => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)))?.label ?? 'Halaman'
  useEffect(() => setOpen(false), [pathname])
  return (
    <div className="flex min-h-screen">
      {open && <div className="fixed inset-0 z-30 animate-fade-in bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-brand-900 text-indigo-100 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-5">
          <Link to="/" className="flex items-center gap-3"><Logo /><div><p className="text-base font-bold text-white">Toko Diaz</p><p className="text-xs text-indigo-300">Point of Sale</p></div></Link>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu"><X size={20} /></button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" aria-label="Menu utama">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-white/15 text-white shadow-inner' : 'hover:bg-white/10'}`}>
              <Icon size={18} />{label}</NavLink>))}
        </nav>
        <p className="px-5 py-4 text-xs text-indigo-300/70">Toko Diaz POS v1.0</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur lg:px-8 print:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <button className="rounded-lg p-1.5 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu"><Menu size={22} /></button>
            <div className="min-w-0"><StoreSwitcher /><p className="truncate text-xs text-slate-500">{current}</p></div>
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            {owner && <NotificationBell />}
            <Link to="/profile" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100" aria-label="Profil saya">
              <UserCircle size={22} className="text-slate-400" />
              <span className="hidden text-right sm:block"><span className="block max-w-40 truncate text-sm font-medium leading-tight">{session?.user.email}</span><span className="block text-xs capitalize leading-tight text-slate-500">{membership?.role}</span></span>
            </Link>
            <button onClick={() => void signOut()} className="btn-secondary btn-sm" aria-label="Keluar"><LogOut size={15} /><span className="hidden sm:inline">Keluar</span></button>
          </div>
        </header>
        <main className="flex-1 p-4 pb-24 lg:p-8 lg:pb-8">{children}</main>
      </div>
    </div>)
}
