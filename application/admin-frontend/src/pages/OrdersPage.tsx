import { useEffect, useMemo, useState } from 'react'
import { fetchAdminOrders, updateAdminOrderStatus } from '../api/adminApi'
import { Order, OrderStatus } from '../types/Order'

const statusOptions: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  async function loadOrders() {
    const data = await fetchAdminOrders()
    setOrders(data)
    setSelectedOrder((current) => {
      if (!current) return current
      const fresh = data.find((o) => o.id === current.id)
      return fresh ?? current
    })
    setLastUpdated(new Date())
  }

  useEffect(() => {
    loadOrders()
    const id = setInterval(loadOrders, 8000)
    return () => clearInterval(id)
  }, [])

  const filteredOrders = useMemo(() => orders.filter((order) => {
    const query = search.toLowerCase()
    const matchesSearch = !query ||
      String(order.id ?? '').toLowerCase().includes(query) ||
      order.customer?.name?.toLowerCase().includes(query) ||
      order.customer?.userid?.toLowerCase().includes(query)
    const matchesStatus = status === 'All' || order.status === status
    return matchesSearch && matchesStatus
  }), [orders, search, status])

  async function handleStatusChange(orderId: number, nextStatus: string) {
    const updated = await updateAdminOrderStatus(orderId, nextStatus)
    setOrders((current) => current.map((order) => order.id === orderId ? { ...order, status: updated.status } : order))
    setSelectedOrder((current) => current && current.id === orderId ? { ...current, status: updated.status } : current)
  }

  return (
    <>
        <header className="admin-header">
          <div>
            <p className="eyebrow">Operations</p>
            <h1 className="admin-title">Order Management</h1>
          </div>
          <span className="sync-indicator">
            <span className={`sync-dot ${orders.length ? 'sync-dot--on' : ''}`} aria-hidden="true" />
            {lastUpdated ? `Synced ${lastUpdated.toLocaleTimeString()}` : 'Syncing…'}
          </span>
        </header>

        <div className="admin-toolbar">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order ID or customer" />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="All">All statuses</option>
            {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>

        <div className="admin-table-panel panel">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Items</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id ?? order.orderNumber}>
                  <td><button className="link-button" onClick={() => setSelectedOrder(order)}>{order.orderNumber ?? `#${order.id}`}</button></td>
                  <td>{order.customer?.name ?? 'Guest'}</td>
                  <td>{order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '—'}</td>
                  <td>{order.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0}</td>
                  <td>${Number(order.total ?? 0).toFixed(2)}</td>
                  <td>{order.paymentMethod}</td>
                  <td>
                    <select
                      className="status-select"
                      value={order.status}
                      onChange={(e) => handleStatusChange(order.id ?? 0, e.target.value)}
                    >
                      {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedOrder && (
          <div className="admin-form-card detail-panel">
            <h2>Order Details</h2>
            <div className="detail-grid">
              <div><span>Order</span><strong>{selectedOrder.orderNumber ?? `#${selectedOrder.id}`}</strong></div>
              <div><span>Customer</span><strong>{selectedOrder.customer?.name}</strong></div>
              <div><span>User ID</span><strong>{selectedOrder.customer?.userid ?? '—'}</strong></div>
              <div><span>Payment</span><strong>{selectedOrder.paymentMethod}</strong></div>
              <div><span>Status</span><strong>{selectedOrder.status}</strong></div>
              <div><span>Total</span><strong>${Number(selectedOrder.total ?? 0).toFixed(2)}</strong></div>
              <div className="full-width"><span>Delivery</span><strong>{selectedOrder.deliveryAddress ?? '—'}</strong></div>
            </div>
            <div className="details-list">
              {(selectedOrder.items ?? []).map((item) => (
                <div key={item.id ?? item.productId} className="detail-item">
                  <span>{item.productNameSnapshot ?? `Product ${item.productId}`}</span>
                  <span>Qty {item.quantity}</span>
                  <span>${Number(item.unitPrice ?? 0).toFixed(2)}</span>
                  <span>${Number(item.subtotal ?? 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
    </>
  )
}
