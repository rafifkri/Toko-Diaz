import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import DataTable from './DataTable'
import Pagination from './Pagination'
import { MoneyInput } from './inputs'
import { DatePicker } from './inputs'

afterEach(cleanup)

describe('DataTable', () => {
  const cols = [{ key: 'n', header: 'Nama', cell: (r: { n: string }) => r.n }]
  it('menampilkan baris', () => { render(<DataTable columns={cols} rows={[{ n: 'Kopi' }]} rowKey={r => r.n} />); expect(screen.getByText('Kopi')).toBeTruthy() })
  it('menampilkan keadaan kosong', () => { render(<DataTable columns={cols} rows={[]} rowKey={r => r.n} empty={{ title: 'Belum ada data' }} />); expect(screen.getByText('Belum ada data')).toBeTruthy() })
  it('menampilkan error dengan tombol coba lagi', () => {
    const retry = vi.fn(); render(<DataTable columns={cols} rows={undefined} rowKey={r => r.n} error onRetry={retry} />)
    fireEvent.click(screen.getByText('Coba lagi')); expect(retry).toHaveBeenCalled()
  })
})

describe('Pagination', () => {
  it('menampilkan rentang dan berpindah halaman', () => {
    const on = vi.fn(); render(<Pagination page={2} size={10} total={35} onChange={on} />)
    expect(screen.getByText('Menampilkan 11–20 dari 35')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Berikutnya')); expect(on).toHaveBeenCalledWith(3)
  })
  it('tidak tampil bila kosong', () => { const { container } = render(<Pagination page={1} size={10} total={0} onChange={() => undefined} />); expect(container.firstChild).toBeNull() })
})

describe('MoneyInput', () => {
  it('memformat ribuan dan hanya menerima angka', () => {
    const on = vi.fn(); render(<MoneyInput value={1500000} onChange={on} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('1.500.000'); fireEvent.change(input, { target: { value: '12ab34' } }); expect(on).toHaveBeenCalledWith(1234)
  })
})

describe('DatePicker', () => {
  it('memilih tanggal dari kalender berbahasa Indonesia', () => {
    const on = vi.fn(); render(<DatePicker value="2026-11-24" onChange={on} />)
    fireEvent.click(screen.getByText('24 Nov 2026')); expect(screen.getByText('November 2026')).toBeTruthy()
    fireEvent.click(screen.getByText('10')); expect(on).toHaveBeenCalledWith('2026-11-10')
  })
  it('menolak tanggal di luar batas min/max', () => {
    render(<DatePicker value="2026-11-24" onChange={() => undefined} max="2026-11-25" />)
    fireEvent.click(screen.getByText('24 Nov 2026')); expect((screen.getByText('28') as HTMLButtonElement).disabled).toBe(true)
  })
})
