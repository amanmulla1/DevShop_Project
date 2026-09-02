import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchOrders } from '../api/authApi'
import { Order } from '../types/Order'

export default function OrderHistoryPage() {
  const { user, authenticated, token } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    async function load() {
      if (!token) return
      try {
        const data = await fetchOrders(token)
        if (mounted) setOrders(data)
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Unable to load orders.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [token])

  if (!authenticated || !user || !token) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="account-layout">
      <h1>Order History</h1>
      <p className="auth-subtitle">Orders placed with your account.</p>

      {loading ? (
        <div className="auth-subtitle">Loading orders…</div>
      ) : error ? (
        <div className="auth-error" role="alert">{error}</div>
      ) : orders.length === 0 ? (
        <div className="account-card">
          <p>You have no orders yet.</p>
          <div style={{ marginTop: '1rem' }}>
            <Link to="/products" className="btn btn--primary">Start shopping</Link>
          </div>
        </div>
      ) : (
        <div className="order-list">
          {orders.map((order) => (
            <div className="order-card" key={order.id ?? order.orderNumber}>
              <div className="order-card__head">
                <div>
                  <div className="order-card__number">{order.orderNumber ?? `Order #${order.id}`}</div>
                  <div className="account-field__label">
                    {order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '—'}
                  </div>
                </div>
                <span className="status-pill">{order.status}</span>
              </div>

              <div className="order-items">
                {(order.items ?? []).map((item) => (
                  <div key={item.id ?? item.productNameSnapshot} className="order-card__line">
                    <span>{item.productNameSnapshot}</span>
                    <span>{item.quantity} × ${Number(item.unitPrice ?? 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="order-total">
                <span>Total</span>
                <span>${Number(order.total ?? 0).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
