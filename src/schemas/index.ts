import { z } from 'zod'

const money = z.number({ invalid_type_error: 'Isi dengan angka' }).int('Harus bilangan bulat').min(0, 'Tidak boleh negatif')
const optionalText = z.string().trim().max(200).optional().or(z.literal(''))

export const loginSchema = z.object({
  email: z.string().trim().email('Email tidak valid'),
  password: z.string().min(6, 'Minimal 6 karakter'),
})
export const registerSchema = loginSchema.extend({
  fullName: z.string().trim().min(2, 'Nama wajib diisi'),
  storeName: z.string().trim().min(2, 'Nama toko wajib diisi'),
  password: z.string().min(8, 'Minimal 8 karakter'),
})
export const forgotSchema = z.object({ email: z.string().trim().email('Email tidak valid') })
export const newPasswordSchema = z.object({
  password: z.string().min(8, 'Minimal 8 karakter'),
  confirm: z.string(),
}).refine(v => v.password === v.confirm, { path: ['confirm'], message: 'Kata sandi tidak sama' })

export const productSchema = z.object({
  product_code: z.string().trim().min(1, 'Kode wajib diisi').max(50),
  product_name: z.string().trim().min(1, 'Nama wajib diisi').max(150),
  unit: z.string().trim().min(1, 'Satuan wajib diisi').max(20),
  selling_price: money,
  minimum_stock: money,
  barcode: z.string().trim().max(60).optional().or(z.literal('')),
  category_id: z.string().optional().or(z.literal('')),
  initial_stock: money.optional(),
  initial_cost: money.optional(),
})
export type ProductForm = z.infer<typeof productSchema>

export const categorySchema = z.object({ category_name: z.string().trim().min(1, 'Nama kategori wajib diisi').max(80), description: optionalText })
export type CategoryForm = z.infer<typeof categorySchema>

export const supplierSchema = z.object({
  supplier_name: z.string().trim().min(1, 'Nama supplier wajib diisi').max(120),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  contact_person: optionalText,
  address: z.string().trim().max(300).optional().or(z.literal('')),
  notes: z.string().trim().max(300).optional().or(z.literal('')),
})
export type SupplierForm = z.infer<typeof supplierSchema>

export const expenseSchema = z.object({
  expense_date: z.string().min(1, 'Tanggal wajib diisi'),
  category: z.string().trim().min(1, 'Pilih kategori'),
  description: z.string().trim().max(300).optional().or(z.literal('')),
  amount: z.number({ invalid_type_error: 'Isi dengan angka' }).int().min(1, 'Nominal harus lebih dari nol'),
  payment_method: z.enum(['cash', 'transfer', 'qris', 'other']),
})
export type ExpenseForm = z.infer<typeof expenseSchema>

export const purchaseLineSchema = z.object({
  product_id: z.string().min(1, 'Pilih produk'),
  quantity: z.number().int().min(1, 'Minimal 1'),
  unit_cost: money,
})
export const purchaseSchema = z.object({
  supplier_id: z.string().optional().or(z.literal('')),
  purchase_date: z.string().min(1, 'Tanggal wajib diisi'),
  payment_method: z.enum(['cash', 'transfer', 'other']),
  pay_on_receive: z.boolean(),
  discount: money,
  notes: z.string().trim().max(300).optional().or(z.literal('')),
  due_date: z.string().optional().or(z.literal('')),
  lines: z.array(purchaseLineSchema).min(1, 'Tambahkan minimal satu barang'),
}).refine(v => v.discount <= v.lines.reduce((a, l) => a + l.quantity * l.unit_cost, 0), { path: ['discount'], message: 'Diskon melebihi subtotal' })
export type PurchaseForm = z.infer<typeof purchaseSchema>

export const paymentSchema = z.object({
  amount: z.number().int().min(1, 'Nominal harus lebih dari nol'),
  payment_method: z.enum(['cash', 'transfer', 'other']),
  payment_date: z.string().min(1),
  notes: z.string().trim().max(200).optional().or(z.literal('')),
})
export type PaymentForm = z.infer<typeof paymentSchema>

export const adjustSchema = z.object({
  product_id: z.string().min(1, 'Pilih produk'),
  type: z.enum(['adjustment', 'damage_out', 'lost_out']),
  quantity: z.number().int().min(1, 'Minimal 1'),
  direction: z.enum(['in', 'out']),
  reason: z.string().trim().min(1, 'Alasan wajib diisi').max(200),
  unit_cost: money.optional(),
})
export type AdjustForm = z.infer<typeof adjustSchema>

export const cashierSchema = z.object({
  full_name: z.string().trim().min(2, 'Nama wajib diisi'),
  email: z.string().trim().email('Email tidak valid'),
  password: z.string().min(8, 'Minimal 8 karakter'),
})
export type CashierForm = z.infer<typeof cashierSchema>

export const storeProfileSchema = z.object({
  store_name: z.string().trim().min(1, 'Nama toko wajib diisi').max(100),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  email: z.string().trim().email('Email tidak valid').optional().or(z.literal('')),
})
export type StoreProfileForm = z.infer<typeof storeProfileSchema>

export const receiptSettingsSchema = z.object({
  receipt_footer: z.string().trim().max(150),
  receipt_width: z.union([z.literal(58), z.literal(80)]),
  auto_print_receipt: z.boolean(),
})
export const stockSettingsSchema = z.object({
  default_unit: z.string().trim().min(1, 'Satuan wajib diisi').max(20),
  default_minimum_stock: money,
})
export const bankSchema = z.object({
  bank_name: z.string().trim().max(60).optional().or(z.literal('')),
  bank_account_number: z.string().trim().max(40).optional().or(z.literal('')),
  bank_account_name: z.string().trim().max(80).optional().or(z.literal('')),
})
export const profileSchema = z.object({ full_name: z.string().trim().min(2, 'Nama wajib diisi'), phone: z.string().trim().max(30).optional().or(z.literal('')) })
