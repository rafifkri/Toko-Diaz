import type { MovementType } from '../../types'

export const movementLabel: Record<MovementType, string> = {
  sale_out: 'Penjualan', purchase_in: 'Pembelian masuk', return_in: 'Retur masuk', adjustment: 'Penyesuaian',
  damage_out: 'Rusak', lost_out: 'Hilang', opname: 'Stok opname',
}
