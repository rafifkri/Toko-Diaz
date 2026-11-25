import { Settings2 } from 'lucide-react'

/** Ditampilkan bila variabel lingkungan Supabase belum diisi, menggantikan layar putih. */
export default function ConfigError({ message }: { message: string }) {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="card w-full max-w-lg space-y-3" role="alert">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-600"><Settings2 /></div>
        <h1 className="text-xl font-bold">Konfigurasi belum lengkap</h1>
        <p className="text-sm text-slate-600">{message}</p>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{`VITE_SUPABASE_URL=https://xxxx.supabase.co\nVITE_SUPABASE_ANON_KEY=eyJ... atau sb_publishable_...`}</pre>
        <p className="text-xs text-slate-400">Nilai ada di Supabase: Project Settings, API. Jangan memakai key service_role.</p>
      </div>
    </div>)
}
