import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute, RequireOwner } from './routes/guards'
import { PageLoader } from './components/ui/feedback'
import Login from './pages/auth/Login'
import { ForgotPassword, ResetPassword } from './pages/auth/PasswordPages'
import NotFound from './pages/system/NotFound'
import Pos from './pages/pos/Pos'
import Home from './pages/dashboard/Home'

// Halaman owner dipecah per rute agar kasir tidak mengunduh kode laporan/grafik.
const Products = lazy(() => import('./pages/products/Products'))
const ProductDetail = lazy(() => import('./pages/products/ProductDetail'))
const Categories = lazy(() => import('./pages/master/Categories'))
const Suppliers = lazy(() => import('./pages/master/Suppliers'))
const SupplierDetail = lazy(() => import('./pages/master/SupplierDetail'))
const Purchases = lazy(() => import('./pages/purchases/Purchases'))
const PurchaseFormPage = lazy(() => import('./pages/purchases/PurchaseFormPage'))
const PurchaseDetail = lazy(() => import('./pages/purchases/PurchaseDetail'))
const Inventory = lazy(() => import('./pages/inventory/Inventory'))
const Expenses = lazy(() => import('./pages/expenses/Expenses'))
const Reports = lazy(() => import('./pages/reports/Reports'))
const Users = lazy(() => import('./pages/users/Users'))
const AuditLog = lazy(() => import('./pages/audit/AuditLog'))
const Settings = lazy(() => import('./pages/settings/Settings'))
const SalesHistory = lazy(() => import('./pages/sales/SalesHistory'))
const Profile = lazy(() => import('./pages/profile/Profile'))

const owner = (el: JSX.Element) => <RequireOwner>{el}</RequireOwner>

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Navigate to="/login" replace />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Home />} />
          <Route path="/pos" element={<Pos />} />
          <Route path="/sales" element={<SalesHistory />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/products" element={owner(<Products />)} />
          <Route path="/products/:id" element={owner(<ProductDetail />)} />
          <Route path="/categories" element={owner(<Categories />)} />
          <Route path="/suppliers" element={owner(<Suppliers />)} />
          <Route path="/suppliers/:id" element={owner(<SupplierDetail />)} />
          <Route path="/purchases" element={owner(<Purchases />)} />
          <Route path="/purchases/new" element={owner(<PurchaseFormPage />)} />
          <Route path="/purchases/:id" element={owner(<PurchaseDetail />)} />
          <Route path="/purchases/:id/edit" element={owner(<PurchaseFormPage />)} />
          <Route path="/inventory" element={owner(<Inventory />)} />
          <Route path="/expenses" element={owner(<Expenses />)} />
          <Route path="/reports" element={owner(<Reports />)} />
          <Route path="/users" element={owner(<Users />)} />
          <Route path="/audit" element={owner(<AuditLog />)} />
          <Route path="/settings" element={owner(<Settings />)} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>)
}
