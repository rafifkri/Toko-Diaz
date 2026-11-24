import { useState } from 'react'
import { Download } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { useStore } from '../../contexts/AuthContext'
import { useDismiss } from '../../hooks'
import { exportCsv, exportPdf, exportXlsx, type ExportTable } from '../../utils/export'
import { errMsg } from '../../utils/errors'

/** Tombol export CSV / Excel / PDF. `build` dipanggil saat diklik sehingga memakai data terbaru. */
export default function ExportMenu({ filename, build, disabled }: { filename: string; build: () => ExportTable[] | Promise<ExportTable[]>; disabled?: boolean }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false)
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false)); const toast = useToast(); const { storeName } = useStore()
  const run = async (kind: 'csv' | 'xlsx' | 'pdf') => {
    setOpen(false); setBusy(true)
    try {
      const tables = await build()
      if (kind === 'xlsx') await exportXlsx(filename, tables)
      else if (kind === 'pdf') await exportPdf(filename, tables, storeName)
      else tables.forEach((t, i) => exportCsv(tables.length > 1 ? `${filename}-${i + 1}` : filename, t))
    } catch (e) { toast.error(errMsg(e, 'Export gagal.')) } finally { setBusy(false) }
  }
  return (
    <div ref={ref} className="relative print:hidden">
      <button className="btn-secondary" disabled={disabled || busy} onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}><Download size={16} />{busy ? 'Menyiapkan…' : 'Export'}</button>
      {open && <div role="menu" className="absolute right-0 z-30 mt-1 w-40 animate-pop rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
        {([['pdf', 'PDF'], ['xlsx', 'Excel (.xlsx)'], ['csv', 'CSV']] as const).map(([k, l]) => <button key={k} role="menuitem" className="block w-full px-4 py-2 text-left text-sm hover:bg-slate-50" onClick={() => void run(k)}>{l}</button>)}</div>}
    </div>)
}
