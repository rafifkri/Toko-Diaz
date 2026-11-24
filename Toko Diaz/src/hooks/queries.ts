import { useQuery } from '@tanstack/react-query'
import { useStore } from '../contexts/AuthContext'
import { listCategories, listActiveSuppliers } from '../services/master'
import { listProductOptions } from '../services/products'
import { getStoreSettings, listPaymentSettings } from '../services/settings'
import { listExpenseCategories } from '../services/expenses'

/** Query yang dipakai berulang di banyak halaman. */
export const useCategories = () => { const { storeId } = useStore(); return useQuery({ queryKey: ['categories', storeId], queryFn: () => listCategories(storeId) }) }
export const useSupplierOptions = () => { const { storeId } = useStore(); return useQuery({ queryKey: ['supplier-options', storeId], queryFn: () => listActiveSuppliers(storeId) }) }
export const useProductOptions = () => { const { storeId } = useStore(); return useQuery({ queryKey: ['product-options', storeId], queryFn: () => listProductOptions(storeId) }) }
export const useStoreSettings = () => { const { storeId } = useStore(); return useQuery({ queryKey: ['store-settings', storeId], queryFn: () => getStoreSettings(storeId), staleTime: 300_000 }) }
export const usePaymentSettings = () => { const { storeId } = useStore(); return useQuery({ queryKey: ['payment-settings', storeId], queryFn: () => listPaymentSettings(storeId) }) }
export const useExpenseCategories = () => { const { storeId } = useStore(); return useQuery({ queryKey: ['expense-categories', storeId], queryFn: () => listExpenseCategories(storeId) }) }
