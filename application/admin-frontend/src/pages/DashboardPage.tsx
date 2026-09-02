import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAdminProducts, fetchAdminCustomers, fetchAdminOrders } from '../api/adminApi'
import { Product } from '../types/Product'
import { Customer } from '../types/Customer'
import { Order, OrderStatus } from '../types/Order'

const STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']

const STAT_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
}

export default function DashboardPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadAll()
    const id = setInterval(loadAll, 10000)
    return () => clearInterval(id)
  }, [])

  async function loadAll() {
    try {
      const [productData, customerData, orderData] = await Promise.all([
        fetchAdminProducts(),
        fetchAdminCustomers(),
        fetchAdminOrders(),
      ])
      setProducts(productData)
      setCustomers(customerData)
      setOrders(orderData)
      setError('')
    } catch (err) {
      // Keep existing data on a transient failure, but surface the problem.
      setError(err instanceof Error ? err.message : 'Unable to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const metrics = useMemo(() => {
    const revenue = orders.reduce((sum, order) => sum + (Number(order.total ?? 0)), 0)
    const countBy: Record<OrderStatus, number> = { PENDING: 0, CONFIRMED: 0, PROCESSING: 0, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0 }
    for (const order of orders) {
      const st = order.status ?? 'PENDING'
      if (st in countBy) countBy[st as OrderStatus] += 1
    }
    const completed = countBy.DELIVERED
    const lowStock = products.filter((product) => product.stock <= 10).length

    return { revenue, orders: orders.length, customers: customers.length, products: products.length, pending: countBy.PENDING, completed, lowStock, countBy }
  }, [orders, customers, products])

  const recentOrders = [...orders].slice(-5).reverse()

  const revenueSeries = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const order of orders) {
      const day = order.orderDate ? order.orderDate.slice(0, 10) : 'Unknown'
      byDay.set(day, (byDay.get(day) ?? 0) + Number(order.total ?? 0))
    }
    return [...byDay.entries()]
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  }, [orders])

  return (
    <>
        {loading ? (
          <div className="admin-empty">Loading dashboard…</div>
        ) : (
          <>
            {error && <div className="admin-form-card checkout-error">{error}</div>}
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
                  <div>
                    <h2 className="panel__title">Revenue</h2>
                    <p className="panel__subtitle">Money generated per day</p>
                  </div>
                  <span>{revenueSeries.length ? `${revenueSeries.length} days` : 'No revenue data'}</span>
                </div>
                {revenueSeries.length === 0 ? (
                  <div className="chart-empty">No revenue to chart yet.</div>
                ) : (
                  <RevenueChart data={revenueSeries} />
                )}
              </div>

              <div className="panel">
                <div className="panel__header">
                  <div>
                    <h2 className="panel__title">Order Status</h2>
                    <p className="panel__subtitle">Live count per status</p>
                  </div>
                </div>
                <div className="status-list">
                  {STATUSES.map((status) => (
                    <div key={status} className={`status-list__row status-list__row--${status.toLowerCase()}`}>
                      <span>{STAT_LABELS[status]}</span>
                      <strong>{metrics.countBy[status]}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="admin-table-panel panel">
              <div className="panel__header">
                <h2>Recent Orders</h2>
                <Link to="/orders">View all</Link>
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
                        <td><span className={`status-pill status-pill--color status-pill--${order.status.toLowerCase()}`}>{order.status}</span></td>
                        <td>${Number(order.total ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
    </>
  )
}

interface RevenuePoint {
  date: string
  revenue: number
}

function RevenueChart({ data }: { data: RevenuePoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(620)
  const [hover, setHover] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setContainerWidth(el.clientWidth || 620)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const height = 220
  const padTop = 18
  const padBottom = 26
  const padLeft = 46
  const padRight = 14
  const innerH = height - padTop - padBottom
  const innerW = Math.max(containerWidth - padLeft - padRight, 60)

  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1)
  const niceMax = Math.ceil(maxRevenue / 4) * 4 || 4
  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0)
  const avgPerDay = data.length ? totalRevenue / data.length : 0
  const bestDay = data.reduce((best, d) => (d.revenue > best.revenue ? d : best), data[0])

  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0

  const points = data.map((point, i) => {
    const x = padLeft + i * stepX
    const y = padTop + innerH - (point.revenue / niceMax) * innerH
    return { ...point, x, y, i }
  })

  const linePath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${(points[points.length - 1]?.x ?? padLeft).toFixed(1)} ${padTop + innerH} L ${padLeft} ${padTop + innerH} Z`

  const gridlines = [0, 0.25, 0.5, 0.75, 1]
  const fmt = (n: number) => n >= 10000 ? `$${(n / 1000).toFixed(0)}k` : `$${Math.round(n)}`

  return (
    <div className="revenue-chart" ref={containerRef}>
      <div className="revenue-chart__stats">
        <div className="revenue-chart__stats-col">
          <span className="revenue-chart__stat-label">Avg. per day</span>
          <strong className="revenue-chart__stat-value">${avgPerDay.toFixed(2)}</strong>
        </div>
        <div className="revenue-chart__stats-col">
          <span className="revenue-chart__stat-label">Best day</span>
          <strong className="revenue-chart__stat-value revenue-chart__stat-value--sm">{bestDay ? bestDay.date.slice(5) : '—'}</strong>
          <span className="revenue-chart__stat-sub">${bestDay ? bestDay.revenue.toFixed(2) : '0.00'}</span>
        </div>
        <span className="revenue-chart__badge">● Live</span>
      </div>

      <svg
        width={Math.max(containerWidth, 60)}
        height={height}
        role="img"
        aria-label="Revenue over time"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const localX = e.clientX - rect.left
          const idx = Math.round((localX - padLeft) / stepX)
          if (idx >= 0 && idx < points.length) setHover(idx)
        }}
      >
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="revenueLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>

        {gridlines.map((g) => {
          const y = padTop + innerH - g * innerH
          return (
            <g key={g}>
              <line x1={padLeft} y1={y} x2={padLeft + innerW} y2={y} stroke="#eef2f7" strokeWidth="1" />
              <text x={padLeft - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
                {fmt(niceMax * g)}
              </text>
            </g>
          )
        })}

        {areaPath && <path d={areaPath} fill="url(#revenueFill)" />}
        {linePath && <path d={linePath} fill="none" stroke="url(#revenueLine)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}

        {points.map((p) => (
          <g key={p.date}>
            <circle cx={p.x} cy={p.y} r={hover === p.i ? 6 : 3.5} fill="#6366f1" stroke="#fff" strokeWidth="2" />
            <text x={p.x} y={height - 8} textAnchor="middle" fontSize="10" fill={hover === p.i ? '#4f46e5' : '#94a3b8'} fontWeight={hover === p.i ? '700' : '400'}>
              {p.date.slice(5)}
            </text>
          </g>
        ))}

        {hover !== null && points[hover] && (() => {
          const p = points[hover]
          const boxW = 88
          const boxH = 30
          const tx = Math.min(Math.max(p.x, padLeft + boxW / 2), containerWidth - padRight - boxW / 2)
          const ty = p.y + 12 + boxH < height ? p.y + 16 : p.y - 12 - boxH
          return (
            <g transform={`translate(${tx} ${ty})`}>
              <rect x={-boxW / 2} y={0} width={boxW} height={boxH} rx={7} fill="#0f172a" stroke="rgba(255,255,255,.15)" />
              <text x={0} y={10.5} textAnchor="middle" fontSize="9" fontFamily="inherit" fill="#94a3b8">
                {p.date.slice(5)}
              </text>
              <text x={0} y={24} textAnchor="middle" fontSize="11" fontFamily="inherit" fontWeight="700" fill="#f8fafc">
                ${p.revenue.toFixed(2)}
              </text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}
