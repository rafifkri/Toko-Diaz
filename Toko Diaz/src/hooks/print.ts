import { useCallback } from 'react'
import { getReceipt } from '../services/sales'
import { printReceipt } from '../utils/receipt'
import { errMsg } from '../utils/errors'
import { useToast } from '../contexts/ToastContext'
import { useStoreSettings } from './queries'

/** Mengambil data struk dari database lalu mencetaknya dengan lebar kertas dari pengaturan. */
export function usePrintReceipt() {
  const toast = useToast()
  const { data: settings } = useStoreSettings()
  return useCallback(async (saleId: string, width?: 58 | 80) => {
    try { printReceipt(await getReceipt(saleId), width ?? settings?.receipt_width ?? 58) } catch (e) { toast.error(errMsg(e, 'Struk gagal dicetak.')) }
  }, [toast, settings?.receipt_width])
}
