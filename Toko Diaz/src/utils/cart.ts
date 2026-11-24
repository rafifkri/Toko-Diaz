import type { PosProduct } from '../types'

export interface CartItem { id: string; name: string; price: number; qty: number; stock: number; unit: string }

type Addable = Pick<PosProduct, 'id' | 'product_name' | 'selling_price' | 'stock' | 'unit'>

/** Menambah 1 barang; jumlah tidak pernah melebihi stok dan barang habis tidak dapat ditambahkan. */
export function addToCart(cart: CartItem[], p: Addable): CartItem[] {
  const existing = cart.find(i => i.id === p.id)
  if (existing) return cart.map(i => (i.id === p.id ? { ...i, stock: p.stock, price: p.selling_price, qty: Math.min(i.qty + 1, p.stock) } : i))
  if (p.stock <= 0) return cart
  return [...cart, { id: p.id, name: p.product_name, price: p.selling_price, qty: 1, stock: p.stock, unit: p.unit }]
}

export function setQty(cart: CartItem[], id: string, qty: number): CartItem[] {
  return cart.map(i => (i.id === id ? { ...i, qty: Math.max(1, Math.min(Math.floor(qty) || 1, i.stock)) } : i))
}

export const removeItem = (cart: CartItem[], id: string): CartItem[] => cart.filter(i => i.id !== id)

export function totals(cart: CartItem[], discount: number) {
  const subtotal = cart.reduce((a, i) => a + i.price * i.qty, 0)
  const disc = Math.min(Math.max(discount, 0), subtotal)
  return { subtotal, discount: disc, total: subtotal - disc, count: cart.reduce((a, i) => a + i.qty, 0) }
}

/** Menyelaraskan keranjang tersimpan dengan data produk terbaru (harga/stok bisa berubah). */
export function reconcileCart(cart: CartItem[], products: Addable[]): CartItem[] {
  const map = new Map(products.map(p => [p.id, p]))
  return cart.flatMap(i => {
    const p = map.get(i.id)
    if (!p || p.stock <= 0) return []
    return [{ ...i, name: p.product_name, price: p.selling_price, stock: p.stock, unit: p.unit, qty: Math.min(i.qty, p.stock) }]
  })
}
