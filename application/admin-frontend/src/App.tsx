import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useEffect } from 'react'
import DashboardPage from './pages/DashboardPage'
import ProductsPage from './pages/ProductsPage'
import CustomersPage from './pages/CustomersPage'
import OrdersPage from './pages/OrdersPage'
import LoginPage from './pages/LoginPage'
import AdminLayout from './components/AdminLayout'
import { AuthProvider, useAuth } from './context/AuthContext'

function RequireAuth() {
  const { authenticated, user, logout } = useAuth()

  useEffect(() => {
    // A customer-role session must never reach the admin dashboard. Clearing
    // the session prevents redirected login <-> dashboard loops.
    if (authenticated && user && user.role !== 'ADMIN') {
      logout()
    }
  }, [authenticated, user, logout])

  if (!authenticated) {
    return <Navigate to="/login" replace />
  }
  if (user && user.role !== 'ADMIN') {
    return <Navigate to="/login" replace />
  }
  return <AdminLayout />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth />}>
            <Route index element={<DashboardPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="orders" element={<OrdersPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
