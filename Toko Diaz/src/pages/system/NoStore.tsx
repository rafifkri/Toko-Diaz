import { useState } from 'react'
import { Store } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { createStore } from '../../services/auth'
import { errMsg } from '../../utils/errors'

/** Akun sudah login tetapi belum punya toko (mis. pendaftaran terputus atau kasir dinonaktifkan). */
export default function NoStore() {
  const { refresh, signOut } = useAuth()
  const toast = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async () => {
    if (name.trim().length < 2) return toast.error('Nama toko wajib diisi.')
    setBusy(true)
    try { await createStore(name); await refresh() } catch (e) { toast.error(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="card w-full max-w-md space-y-4 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600"><Store /></div>
        <h1 className="text-xl font-bold">Akun belum terhubung ke toko</h1>
        <p className="text-sm text-slate-500">Jika Anda kasir, minta pemilik toko membuatkan atau mengaktifkan akun Anda. Jika Anda pemilik baru, buat toko di bawah ini.</p>
        <input className="input" placeholder="Nama toko" value={name} onChange={e => setName(e.target.value)} />
        <button className="btn-primary w-full" disabled={busy} onClick={() => void create()}>{busy ? 'Membuat…' : 'Buat toko'}</button>
        <button className="text-sm text-slate-500 hover:underline" onClick={() => void signOut()}>Keluar</button>
      </div>
    </div>)
}
