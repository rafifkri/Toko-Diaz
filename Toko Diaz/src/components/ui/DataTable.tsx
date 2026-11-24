import type { ReactNode } from 'react'
import { EmptyState, ErrorState, Skeleton } from './feedback'
import Pagination from './Pagination'

export interface Column<T> { key: string; header: ReactNode; cell: (row: T) => ReactNode; align?: 'left' | 'right' | 'center'; className?: string }
interface Props<T> {
  columns: Column<T>[]; rows: T[] | undefined; rowKey: (r: T) => string
  loading?: boolean; error?: boolean; onRetry?: () => void
  empty?: { title: string; description?: string; action?: ReactNode }
  page?: number; size?: number; total?: number; onPage?: (p: number) => void
  rowClass?: (r: T) => string; onRowClick?: (r: T) => void
}
const al = { left: 'text-left', right: 'text-right', center: 'text-center' }

/** Tabel seragam: skeleton saat memuat, keadaan kosong/error, paginasi server, dan scroll horizontal di layar kecil. */
export default function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, empty, page, size, total, onPage, rowClass, onRowClick }: Props<T>) {
  return (
    <div className="card overflow-hidden p-0">
      {error ? <ErrorState onRetry={onRetry} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>{columns.map(c => <th key={c.key} scope="col" className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide ${al[c.align ?? 'left']}`}>{c.header}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="border-t border-slate-100">{columns.map(c => <td key={c.key} className="px-4 py-3"><Skeleton className="h-4 w-full max-w-[140px]" /></td>)}</tr>)) :
                (rows ?? []).map(r => (
                  <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={`border-t border-slate-100 transition hover:bg-slate-50/70 ${onRowClick ? 'cursor-pointer' : ''} ${rowClass?.(r) ?? ''}`}>
                    {columns.map(c => <td key={c.key} className={`px-4 py-3 ${al[c.align ?? 'left']} ${c.className ?? ''}`}>{c.cell(r)}</td>)}
                  </tr>))}
            </tbody>
          </table>
          {!loading && (rows?.length ?? 0) === 0 && <EmptyState title={empty?.title ?? 'Belum ada data'} description={empty?.description} action={empty?.action} />}
        </div>)}
      {!error && page && size && total !== undefined && onPage && <Pagination page={page} size={size} total={total} onChange={onPage} />}
    </div>)
}
