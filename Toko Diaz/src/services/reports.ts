import { rpc } from './http'
import type { FinancialReport, PaymentMethod, PurchaseReport, SaleStatus, SalesBreakdown, SalesReport } from '../types'
import type { Range } from '../utils/period'

export const getFinancialReport = (sid: string, r: Range) => rpc<FinancialReport>('get_financial_report', { p_store: sid, p_from: r[0], p_to: r[1] })

export interface SalesFilter { method: '' | PaymentMethod; status: '' | SaleStatus; categoryId: string; productId: string }
const n = (v: string) => v || null

export const getSalesBreakdown = (sid: string, r: Range, f: Pick<SalesFilter, 'method' | 'categoryId' | 'productId'>) =>
  rpc<SalesBreakdown>('get_sales_breakdown', { p_store: sid, p_from: r[0], p_to: r[1], p_method: n(f.method), p_category: n(f.categoryId), p_product: n(f.productId) })

export const getSalesReport = (sid: string, r: Range, f: SalesFilter, page: number, size: number) =>
  rpc<SalesReport>('get_sales_report', {
    p_store: sid, p_from: r[0], p_to: r[1], p_method: n(f.method), p_status: n(f.status), p_category: n(f.categoryId), p_product: n(f.productId),
    p_limit: size, p_offset: (page - 1) * size,
  })

export const getPurchaseReport = (sid: string, r: Range, f: { supplierId: string; productId: string; status: string }) =>
  rpc<PurchaseReport>('get_purchase_report', { p_store: sid, p_from: r[0], p_to: r[1], p_supplier: n(f.supplierId), p_product: n(f.productId), p_status: n(f.status) })
