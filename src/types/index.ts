// Tipe domain aplikasi. Bentuknya mengikuti skema database (supabase/migrations).

export type Role = 'owner' | 'cashier'
export type PaymentMethod = 'cash' | 'transfer' | 'qris'
export type SaleStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded'
export type ReceivingStatus = 'draft' | 'received' | 'cancelled'
export type PurchasePaymentStatus = 'unpaid' | 'partial' | 'paid'
export type StockStatus = 'ok' | 'low' | 'out'
export type MovementType = 'sale_out' | 'purchase_in' | 'return_in' | 'adjustment' | 'damage_out' | 'lost_out' | 'opname'
export type ExpenseMethod = 'cash' | 'transfer' | 'qris' | 'other'
export type PurchaseMethod = 'cash' | 'transfer' | 'other'

export interface Membership { member_id: string; store_id: string; role: Role; store_name: string }

export interface Category { id: string; store_id: string; category_name: string; description: string | null; created_at: string }

export interface Product {
  id: string; store_id: string; category_id: string | null; product_code: string; barcode: string | null; product_name: string; unit: string
  purchase_price: number; average_cost: number; selling_price: number; stock: number; minimum_stock: number
  image_url: string | null; is_active: boolean; created_at: string; updated_at: string
}
export interface ProductRow extends Product { category_name: string | null; stock_status: StockStatus }
export interface PosProduct {
  id: string; store_id: string; category_id: string | null; product_code: string; barcode: string | null; product_name: string
  unit: string; selling_price: number; stock: number; minimum_stock: number; image_url: string | null; photo: string | null
}
export interface ProductOption { id: string; product_code: string; product_name: string; unit: string; purchase_price: number; stock: number }

export interface Supplier {
  id: string; store_id: string; supplier_name: string; phone: string | null; address: string | null
  contact_person: string | null; notes: string | null; is_active: boolean; created_at: string
}

export interface Sale {
  id: string; store_id: string; invoice_number: string; sale_date: string; subtotal: number; discount: number; total_amount: number
  payment_method: PaymentMethod; payment_status: SaleStatus; cashier_id: string | null
  received_amount: number | null; change_amount: number; refunded_amount: number
}
export interface ReceiptItem { id: string; name: string; quantity: number; price: number; subtotal: number; returned: number }
export interface Receipt {
  id: string; store: string; address: string | null; phone: string | null; invoice: string; date: string; cashier: string | null
  method: PaymentMethod; status: SaleStatus; subtotal: number; discount: number; total: number
  received: number | null; change: number; refunded: number; footer: string; reference: string | null; items: ReceiptItem[]
}
export interface SaleReturn {
  id: string; sale_id: string; return_number: string | null; reason: string; refund_amount: number; restock: boolean; created_at: string
}
export interface RefundLine { sale_item_id: string; quantity: number }

export interface PurchaseItem {
  id: string; purchase_id: string; product_id: string; quantity: number; unit_cost: number; subtotal: number
  allocated_cost: number | null; products?: { product_name: string; unit: string } | null
}
export interface Purchase {
  id: string; store_id: string; supplier_id: string | null; purchase_number: string; purchase_date: string; subtotal: number
  discount: number; total_amount: number; paid_amount: number; payment_status: PurchasePaymentStatus; receiving_status: ReceivingStatus
  pay_on_receive: boolean; payment_method: PurchaseMethod; due_date: string | null; notes: string | null; created_at: string
  suppliers?: { supplier_name: string } | null
}
export interface PurchasePayment {
  id: string; purchase_id: string; payment_date: string; amount: number; payment_method: PurchaseMethod; notes: string | null; created_at: string
}
export interface PurchaseLine { product_id: string; quantity: number; unit_cost: number }

export interface StockMovement {
  id: string; product_id: string; movement_type: MovementType; quantity: number; stock_before: number; stock_after: number
  reference_type: string | null; notes: string | null; created_at: string; products?: { product_name: string; unit: string } | null
}
export interface OpnameLine { product_id: string; counted: number }
export interface StockOpname { id: string; opname_number: string; notes: string | null; created_at: string; stock_opname_items: { id: string }[] }

export interface Expense {
  id: string; expense_number: string; expense_date: string; category: string; description: string | null; amount: number
  payment_method: ExpenseMethod; receipt_path: string | null; status: 'active' | 'voided'; created_at: string
}
export interface ExpenseCategory { id: string; store_id: string; category_name: string; is_active: boolean }

export interface StoreProfile { id: string; store_name: string; address: string | null; phone: string | null; email: string | null; logo_url: string | null }
export interface StoreSettings {
  store_id: string; receipt_footer: string; receipt_width: 58 | 80; auto_print_receipt: boolean; default_unit: string; default_minimum_stock: number
}
export interface PaymentSetting {
  id: string; store_id: string; payment_method: PaymentMethod; is_active: boolean; qris_path: string | null
  bank_name: string | null; bank_account_number: string | null; bank_account_name: string | null
}

export interface Member { id: string; user_id: string; role: Role; is_active: boolean; profiles: { full_name: string | null; email: string | null } | null }
export interface AuditLog {
  id: string; user_id: string | null; action: string; table_name: string | null; record_id: string | null
  old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; created_at: string
  profiles?: { full_name: string | null; email: string | null } | null
}

// Hasil fungsi laporan database
export interface FinancialReport {
  transactions: number; gross_sales: number; refunds: number; net_sales: number; cogs: number; gross_profit: number; expenses: number
  net_profit: number; purchases: number; purchases_paid: number; cash_in: number; cash_out: number; net_cash: number
  avg_transaction: number; pending_count: number; pending_amount: number
  by_method: Partial<Record<PaymentMethod, number>>; daily: { d: string; sales: number }[]
}
export interface SalesBreakdown {
  products: { name: string; category: string; qty: number; revenue: number; cogs: number }[]
  categories: { name: string; qty: number; revenue: number; cogs: number }[]
}
export interface SalesReportRow {
  id: string; invoice_number: string; sale_date: string; payment_method: PaymentMethod; payment_status: SaleStatus
  total_amount: number; refunded_amount: number; cashier: string | null
}
export interface SalesReport { total: number; sum: number; rows: SalesReportRow[] }
export interface PurchaseReport {
  by_supplier: { name: string; count: number; total: number; unpaid: number }[]
  by_product: { name: string; qty: number; total: number }[]
  list: { number: string; date: string; supplier: string; total: number; paid: number; payment_status: PurchasePaymentStatus; receiving_status: ReceivingStatus }[]
}
export interface LowStockItem { id: string; name: string; stock: number; minimum_stock: number; unit: string }
export interface LowStock { count: number; items: LowStockItem[] }
export interface Dashboard {
  month: { sales: number; purchases: number; expenses: number; gross_profit: number; net_profit: number }
  today: { sales: number; transactions: number }
  series: { month: string; sales: number; purchases: number; expenses: number; gross_profit: number; net_profit: number }[]
  expense_by_category: { name: string; total: number }[]
  recent_sales: { id: string; invoice_number: string; sale_date: string; total_amount: number; payment_method: PaymentMethod; payment_status: SaleStatus }[]
  top_products: { name: string; qty: number; revenue: number }[]
  lowest_stock: { name: string; stock: number; minimum_stock: number; unit: string }[]
  recent_purchases: { id: string; purchase_number: string; purchase_date: string; total_amount: number; receiving_status: ReceivingStatus; payment_status: PurchasePaymentStatus; supplier_name: string | null }[]
  active_products: number; low_stock: number; pending_sales: number; payables: number
}
export interface CashierSummary { sales: number; transactions: number; pending: number }

export interface Page<T> { rows: T[]; total: number }
