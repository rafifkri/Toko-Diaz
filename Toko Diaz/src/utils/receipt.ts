import { dateTimeLabel, rupiah } from './format'
import type { Receipt } from '../types'

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

const METHOD: Record<string, string> = { cash: 'Tunai', transfer: 'Transfer', qris: 'QRIS' }
const STATUS: Record<string, string> = { paid: 'LUNAS', pending: 'MENUNGGU PEMBAYARAN', failed: 'GAGAL', cancelled: 'DIBATALKAN', refunded: 'DIREFUND' }

/** Membuat HTML struk (58/80 mm). Semua teks dari pengguna di-escape. */
export function buildReceiptHtml(r: Receipt, mm: 58 | 80): string {
  const rows = r.items.map(i =>
    `<tr><td colspan="2">${esc(i.name)}</td></tr><tr><td>${i.quantity} x ${rupiah(i.price)}</td><td class="r">${rupiah(i.subtotal)}</td></tr>` +
    (i.returned > 0 ? `<tr><td colspan="2" class="s">  retur ${i.returned}</td></tr>` : '')).join('')
  const cash = r.method === 'cash' && r.received != null
    ? `<tr><td>Uang diterima</td><td class="r">${rupiah(r.received)}</td></tr><tr><td>Kembalian</td><td class="r">${rupiah(r.change)}</td></tr>` : ''
  const ref = r.reference ? `<tr><td>Ref.</td><td class="r">${esc(r.reference)}</td></tr>` : ''
  const refunded = r.refunded > 0 ? `<tr><td>Refund</td><td class="r">-${rupiah(r.refunded)}</td></tr>` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.invoice)}</title><style>
@page{size:${mm}mm auto;margin:2mm}body{width:${mm - 4}mm;font:${mm === 58 ? 10 : 12}px/1.35 monospace;margin:0;color:#000}
table{width:100%;border-collapse:collapse}.r{text-align:right}.c{text-align:center}.s{font-size:.9em;color:#444}hr{border:0;border-top:1px dashed #000;margin:4px 0}</style></head><body>
<div class="c"><b>${esc(r.store)}</b><br>${esc(r.address ?? '')}<br>${esc(r.phone ?? '')}</div><hr>
${esc(r.invoice)}<br>${esc(dateTimeLabel(r.date))}<br>Kasir: ${esc(r.cashier ?? '-')}<hr><table>${rows}</table><hr>
<table><tr><td>Subtotal</td><td class="r">${rupiah(r.subtotal)}</td></tr><tr><td>Diskon</td><td class="r">${rupiah(r.discount)}</td></tr>
<tr><td><b>Total</b></td><td class="r"><b>${rupiah(r.total)}</b></td></tr><tr><td>Bayar</td><td class="r">${esc(METHOD[r.method] ?? r.method)}</td></tr>${cash}${ref}${refunded}
<tr><td>Status</td><td class="r">${esc(STATUS[r.status] ?? r.status)}</td></tr></table><hr><div class="c">${esc(r.footer)}</div></body></html>`
}

/** Mencetak lewat iframe tersembunyi sehingga tidak terblokir pop-up blocker. */
export function printReceipt(r: Receipt, mm: 58 | 80): void {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) { frame.remove(); return }
  doc.open(); doc.write(buildReceiptHtml(r, mm)); doc.close()
  const go = () => { win.focus(); win.print(); setTimeout(() => frame.remove(), 1500) }
  if (doc.readyState === 'complete') setTimeout(go, 50); else frame.onload = go
}
