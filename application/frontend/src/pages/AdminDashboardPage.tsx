import { useEffect, useMemo, useState } from 'react'
import { fetchAdminProducts, fetchAdminCustomers, fetchAdminOrders } from '../api/adminApi'
import { Product } from '../types/Product'
import { Customer } from '../types/Customer'
import { Order } from '../types/Order'

const navItems = [
  { label: 'Dashboard', href: '/admin', active: true },
  { label: 'Products', href: '/admin/products' },
  { label: 'Customers', href: '/admin/customers' },
  { label: 'Orders', href: '/admin/orders' },
  { label: 'Analytics', href: '/admin/analytics' },
  { label: 'Settings', href: '/admin/settings' },
]

export default function AdminDashboardPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchAdminProducts(), fetchAdminCustomers(), fetchAdminOrders()])
      .then(([productData, customerData, orderData]) => {
        setProducts(productData)
        setCustomers(customerData)
        setOrders(orderData)
      })
      .catch(() => {
        setProducts([])
        setCustomers([])
        setOrders([])
      })
      .finally(() => setLoading(false))
  }, [])

  const metrics = useMemo(() => {
    const revenue = orders.reduce((sum, order) => sum + (Number(order.total ?? 0)), 0)
    const pending = orders.filter((order) => order.status === 'PENDING').length
    const completed = orders.filter((order) => order.status === 'DELIVERED').length
    const lowStock = products.filter((product) => product.stock <= 10).length

    return {
      revenue,
      orders: orders.length,
      customers: customers.length,
      products: products.length,
      pending,
      completed,
      lowStock,
    }
  }, [orders, customers, products])

  const recentOrders = [...orders].slice(-5).reverse()

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <div className="admin-brand-mark">D</div>
          <div>
            <div className="admin-brand-title">DevShop</div>
            <div className="admin-brand-subtitle">Admin Console</div>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Admin menu">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`admin-nav__item ${item.active ? 'active' : ''}`}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1 className="admin-title">Business Overview</h1>
          </div>
          <button className="admin-header__button">Export</button>
        </header>

        {loading ? (
          <div className="admin-empty">Loading dashboard…</div>
        ) : (
          <>
            <section className="admin-metrics">
              <div className="metric-card">
                <span>Total Revenue</span>
                <strong>${metrics.revenue.toFixed(2)}</strong>
                <small>{orders.length ? `${orders.length} orders captured` : 'No orders yet'}</small>
              </div>
              <div className="metric-card">
                <span>Total Orders</span>
                <strong>{metrics.orders}</strong>
                <small>{metrics.pending} pending</small>
              </div>
              <div className="metric-card">
                <span>Total Customers</span>
                <strong>{metrics.customers}</strong>
                <small>{customers.length ? 'Customers tracked' : 'No customers yet'}</small>
              </div>
              <div className="metric-card">
                <span>Products</span>
                <strong>{metrics.products}</strong>
                <small>{metrics.lowStock} low stock</small>
              </div>
            </section>

            <section className="admin-panels">
              <div className="panel panel--wide">
                <div className="panel__header">
                  <h2>Sales Overview</h2>
                  <span>{orders.length ? 'Live data' : 'No sales data available'}</span>
                </div>
                <div className="sparkline" aria-label="Sales overview" />
              </div>

              <div className="panel">
                <div className="panel__header">
                  <h2>Order Status</h2>
                </div>
                <div className="status-list">
                  <div><span>Pending</span><strong>{metrics.pending}</strong></div>
                  <div><span>Completed</span><strong>{metrics.completed}</strong></div>
                  <div><span>Low Stock</span><strong>{metrics.lowStock}</strong></div>
                </div>
              </div>
            </section>

            <section className="admin-table-panel panel">
              <div className="panel__header">
                <h2>Recent Orders</h2>
                <a href="/admin/orders">View all</a>
              </div>
              {recentOrders.length === 0 ? (
                <div className="admin-empty">No orders yet.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Status</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr key={order.id ?? order.orderNumber}>
                        <td>{order.orderNumber ?? `#${order.id}`}</td>
                        <td>{order.customer?.name ?? 'Guest'}</td>
                        <td><span className="status-pill">{order.status}</span></td>
                        <td>${Number(order.total ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
