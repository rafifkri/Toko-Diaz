import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="text-6xl font-extrabold text-brand-200">404</p>
      <h1 className="mt-2 text-xl font-bold">Halaman tidak ditemukan</h1>
      <p className="mt-1 text-sm text-slate-500">Alamat yang Anda buka tidak ada atau sudah dipindahkan.</p>
      <Link to="/" className="btn-primary mt-6">Ke Beranda</Link>
    </div>)
}
