import { rpc } from './http'
import type { CashierSummary, Dashboard, LowStock } from '../types'

export const getDashboard = (sid: string) => rpc<Dashboard>('get_dashboard', { p_store: sid })
export const getCashierSummary = (sid: string) => rpc<CashierSummary>('get_cashier_summary', { p_store: sid })
export const getLowStock = (sid: string, limit = 50) => rpc<LowStock>('get_low_stock', { p_store: sid, p_limit: limit })
