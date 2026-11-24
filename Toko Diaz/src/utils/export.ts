// Export laporan: CSV, Excel, dan PDF sungguhan (bukan dialog cetak browser).
// Pustaka berat dimuat saat dibutuhkan agar tidak membebani halaman awal.

export type Cell = string | number | null | undefined
export interface ExportTable { title: string; headers: string[]; rows: Cell[][]; subtitle?: string }

/** Mengubah tabel menjadi teks CSV (RFC 4180). Sel teks berawalan = + - @ diberi tanda kutip tunggal agar tidak dieksekusi sebagai formula di Excel. */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const cell = (v: Cell): string => {
    let s = v == null ? '' : String(v)
    if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers, ...rows].map(r => r.map(cell).join(',')).join('\r\n')
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportCsv(filename: string, t: ExportTable): void {
  download(new Blob(['\ufeff' + toCsv(t.headers, t.rows)], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`)
}

export async function exportXlsx(filename: string, tables: ExportTable[]): Promise<void> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  tables.forEach((t, i) => {
    const aoa: Cell[][] = [[t.title], ...(t.subtitle ? [[t.subtitle]] : []), [], t.headers, ...t.rows]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), t.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || `Sheet${i + 1}`)
  })
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

export async function exportPdf(filename: string, tables: ExportTable[], storeName = 'Toko Diaz'): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  tables.forEach((t, idx) => {
    if (idx > 0) doc.addPage()
    const y = 40
    doc.setFontSize(14).setFont('helvetica', 'bold').text(`${storeName} - ${t.title}`, 40, y)
    if (t.subtitle) doc.setFontSize(9).setFont('helvetica', 'normal').setTextColor(100).text(t.subtitle, 40, y + 16).setTextColor(0)
    autoTable(doc, {
      startY: y + (t.subtitle ? 28 : 18), head: [t.headers], body: t.rows.map(r => r.map(c => (c == null ? '' : String(c)))),
      styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [67, 56, 202] }, alternateRowStyles: { fillColor: [248, 250, 252] },
    })
  })
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i).setFontSize(8).setTextColor(130)
    doc.text(`Dicetak ${new Date().toLocaleString('id-ID')}  |  Halaman ${i} dari ${pages}`, 40, doc.internal.pageSize.getHeight() - 20)
  }
  doc.save(`${filename}.pdf`)
}
