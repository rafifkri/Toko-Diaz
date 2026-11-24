import { describe, expect, it } from 'vitest'
import { adjustSchema, cashierSchema, expenseSchema, newPasswordSchema, productSchema, purchaseSchema, registerSchema } from './index'

const line = { product_id: 'p', quantity: 2, unit_cost: 1000 }
const purchase = { supplier_id: '', purchase_date: '2026-11-24', payment_method: 'cash' as const, pay_on_receive: false, discount: 0, lines: [line] }

describe('skema validasi', () => {
  it('produk: kode, nama, satuan wajib; harga bilangan bulat tidak negatif', () => {
    const ok = { product_code: 'K1', product_name: 'Kopi', unit: 'pcs', selling_price: 1000, minimum_stock: 0 }
    expect(productSchema.safeParse(ok).success).toBe(true)
    expect(productSchema.safeParse({ ...ok, product_code: ' ' }).success).toBe(false)
    expect(productSchema.safeParse({ ...ok, selling_price: -1 }).success).toBe(false)
    expect(productSchema.safeParse({ ...ok, selling_price: 10.5 }).success).toBe(false)
  })
  it('pembelian: minimal satu barang, diskon tidak melebihi subtotal', () => {
    expect(purchaseSchema.safeParse(purchase).success).toBe(true)
    expect(purchaseSchema.safeParse({ ...purchase, lines: [] }).success).toBe(false)
    expect(purchaseSchema.safeParse({ ...purchase, discount: 2001 }).success).toBe(false)
    expect(purchaseSchema.safeParse({ ...purchase, discount: 2000 }).success).toBe(true)
    expect(purchaseSchema.safeParse({ ...purchase, lines: [{ ...line, quantity: 0 }] }).success).toBe(false)
  })
  it('pengeluaran: nominal harus > 0 dan metode valid', () => {
    const e = { expense_date: '2026-11-24', category: 'Air', amount: 1000, payment_method: 'cash' as const }
    expect(expenseSchema.safeParse(e).success).toBe(true)
    expect(expenseSchema.safeParse({ ...e, amount: 0 }).success).toBe(false)
    expect(expenseSchema.safeParse({ ...e, payment_method: 'koin' }).success).toBe(false)
  })
  it('kata sandi: minimal 8 dan konfirmasi harus sama', () => {
    expect(newPasswordSchema.safeParse({ password: 'abcdefgh', confirm: 'abcdefgh' }).success).toBe(true)
    expect(newPasswordSchema.safeParse({ password: 'abcdefgh', confirm: 'abcdefgx' }).success).toBe(false)
    expect(newPasswordSchema.safeParse({ password: 'abc', confirm: 'abc' }).success).toBe(false)
    expect(cashierSchema.safeParse({ full_name: 'Sari', email: 'bukan-email', password: '12345678' }).success).toBe(false)
    expect(registerSchema.safeParse({ fullName: 'A', storeName: 'T', email: 'a@b.id', password: '12345678' }).success).toBe(false)
  })
  it('penyesuaian stok: jumlah minimal 1 dan alasan wajib', () => {
    const a = { product_id: 'p', type: 'damage_out' as const, direction: 'out' as const, quantity: 1, reason: 'pecah' }
    expect(adjustSchema.safeParse(a).success).toBe(true)
    expect(adjustSchema.safeParse({ ...a, reason: ' ' }).success).toBe(false)
    expect(adjustSchema.safeParse({ ...a, quantity: 0 }).success).toBe(false)
  })
})
