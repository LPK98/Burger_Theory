import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AdminAuthProvider, RequireAdmin } from './auth'
import { ConfirmProvider, ToastProvider } from './components/overlay'
import { Spinner } from './components/ui'
import { AdminShell } from './layout'
import { ApiError } from './lib/api'
import { LoginPage } from './pages/LoginPage'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const OrdersPage = lazy(() => import('./pages/OrdersPage'))
const ProductsPage = lazy(() => import('./pages/ProductsPage'))
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'))
const InventoryPage = lazy(() => import('./pages/InventoryPage'))
const CustomersPage = lazy(() => import('./pages/CustomersPage'))
const PaymentsPage = lazy(() => import('./pages/PaymentsPage'))
const PromotionsPage = lazy(() => import('./pages/PromotionsPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const OpeningHoursPage = lazy(() => import('./pages/OpeningHoursPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: true,
      // Don't hammer the API on client errors (validation, 403, 404); retry network blips once.
      retry: (failures, error) => failures < 1 && ApiError.from(error).status === 0,
    },
  },
})

const fallback = (
  <div className="grid min-h-[50vh] place-items-center">
    <Spinner label="Loading page" />
  </div>
)

export function AdminApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter basename="/admin">
            <AdminAuthProvider>
              <Suspense fallback={fallback}>
                <Routes>
                  <Route path="login" element={<LoginPage />} />
                  <Route element={<RequireAdmin />}>
                    <Route element={<AdminShell />}>
                      <Route index element={<Navigate to="/dashboard" replace />} />
                      <Route path="dashboard" element={<DashboardPage />} />
                      <Route path="orders" element={<OrdersPage />} />
                      <Route path="products" element={<ProductsPage />} />
                      <Route path="categories" element={<CategoriesPage />} />
                      <Route path="inventory" element={<InventoryPage />} />
                      <Route path="customers" element={<CustomersPage />} />
                      <Route path="payments" element={<PaymentsPage />} />
                      <Route path="promotions" element={<PromotionsPage />} />
                      <Route path="reports" element={<ReportsPage />} />
                      <Route path="hours" element={<OpeningHoursPage />} />
                      <Route path="settings" element={<SettingsPage />} />
                      <Route path="profile" element={<ProfilePage />} />
                      <Route path="*" element={<NotFoundPage />} />
                    </Route>
                  </Route>
                </Routes>
              </Suspense>
            </AdminAuthProvider>
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
