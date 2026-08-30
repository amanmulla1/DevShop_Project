import { useState } from 'react'
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import CartDrawer from './components/CartDrawer'
import ProductsPage from './pages/ProductsPage'
import CheckoutPage from './pages/CheckoutPage'
import OrderConfirmationPage from './pages/OrderConfirmationPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import AccountPage from './pages/AccountPage'
import OrderHistoryPage from './pages/OrderHistoryPage'
import { AuthProvider } from './context/AuthContext'
import { useCart } from './hooks/useCart'

function CustomerStorefront({ cart }: { cart: ReturnType<typeof useCart> }) {
  const [cartOpen, setCartOpen] = useState(false)
  const navigate = useNavigate()

  function handleCheckout() {
    setCartOpen(false)
    navigate('/checkout')
  }

  return (
    <>
      <Navbar cartCount={cart.totalItems} onCartOpen={() => setCartOpen(true)} />

      <ProductsPage onAddToCart={cart.addToCart} />

      {cartOpen && (
        <CartDrawer
          items={cart.items}
          subtotal={cart.subtotal}
          onClose={() => setCartOpen(false)}
          onIncrease={cart.increaseQuantity}
          onDecrease={cart.decreaseQuantity}
          onRemove={cart.removeFromCart}
          onCheckout={handleCheckout}
        />
      )}
    </>
  )
}

export default function App() {
  const cart = useCart()

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<CustomerStorefront cart={cart} />} />
          <Route path="/products" element={<CustomerStorefront cart={cart} />} />
          <Route path="/about" element={<CustomerStorefront cart={cart} />} />
          <Route path="/checkout" element={<CheckoutPage cart={cart} />} />
          <Route path="/checkout/success" element={<OrderConfirmationPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/orders" element={<OrderHistoryPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
