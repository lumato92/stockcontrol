import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/lib/auth'
import Sidebar from '@/components/layout/Sidebar'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import ProductsPage from '@/pages/ProductsPage'
import StockPage from '@/pages/StockPage'
import MovimientosPage from '@/pages/MovimientosPage'
import DepositosPage from '@/pages/DepositosPage'
import UsersPage from '@/pages/UsersPage'
import { Spinner } from '@/components/ui'
import WarehouseDetailPage from '@/pages/WarehouseDetailPage'

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

function ProtectedLayout() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={28} />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <Outlet />
      </main>
    </div>
  )
}

function AdminOnly() {
  const { user } = useAuth()
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}

function SupervisorOnly() {
  const { user } = useAuth()
  if (!['admin', 'supervisor'].includes(user?.role ?? '')) return <Navigate to="/" replace />
  return <Outlet />
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/productos" element={<ProductsPage />} />
              <Route path="/stock" element={<StockPage />} />
              <Route path="/movimientos" element={<MovimientosPage />} />
              <Route element={<SupervisorOnly />}>
                <Route path="/depositos/:id" element={<WarehouseDetailPage />} />
                <Route path="/depositos" element={<DepositosPage />} />
              </Route>
              <Route element={<AdminOnly />}>
                <Route path="/usuarios" element={<UsersPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
