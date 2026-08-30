import { useLocation, Link } from 'react-router-dom'
import type { Order, OrderStatus } from '../types/Order'
import { getProductVisual } from '../utils/productVisual'

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
}

export default function OrderConfirmationPage() {
  // The order is passed via navigation state after a successful checkout.
  const order = (useLocation().state as { order?: Order } | null)?.order

  if (!order) {
    return (
      <div className="confirmation-page confirmation-page--miss">
        <div className="confirmation-card confirmation-card--center">
          <div className="confirmation-check confirmation-check--neutral" aria-hidden="true">?</div>
          <h1 className="confirmation-title">No order to show</h1>
          <p className="confirmation-sub">We couldn't find an order here. Place one and you'll land back on this page.</p>
          <Link to="/products" className="btn btn--primary">Start shopping</Link>
        </div>
      </div>
    )
  }

  const status: OrderStatus = order.status ?? 'PENDING'
  const items = order.items ?? []
  const shippedTo = [order.deliveryCity, order.deliveryState, order.deliveryPostalCode]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="confirmation-page">
      <div className="confirmation-card">
        <header className="confirmation-hero">
          <div className="confirmation-check" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="confirmation-eyebrow">Order Confirmed</p>
          <h1 className="confirmation-title">Thank you, {order.customer?.name?.split(' ')[0] ?? 'friend'}!</h1>
          <p className="confirmation-sub">
            Your order <strong className="confirmation-order">#{order.orderNumber}</strong> is booked and
            we'll start working on it right away.
          </p>
        </header>

        <div className="confirmation-banner">
          <div className="confirmation-banner__row">
            <span>Status</span>
            <strong><span className={`status-pill status-pill--${status.toLowerCase()}`}>{STATUS_LABELS[status] ?? status}</span></strong>
          </div>
          <div className="confirmation-banner__row">
            <span>Payment</span>
            <strong>{order.paymentMethod === 'PAY_ON_DELIVERY' ? 'Pay on Delivery' : 'Online Payment'}</strong>
          </div>
          <div className="confirmation-banner__row">
            <span>Estimated delivery note</span>
            <strong>Pay when your package arrives</strong>
          </div>
        </div>

        <div className="confirmation-grid">
          <section className="confirmation-block">
            <h2 className="confirmation-block__title">Delivery details</h2>
            <div className="confirmation-fields">
              <div className="confirmation-field">
                <span>Recipient</span>
                <strong>{order.customer?.name}</strong>
              </div>
              <div className="confirmation-field">
                <span>Address</span>
                <strong>{order.deliveryAddress ?? 'Address pending'}</strong>
              </div>
              {shippedTo && (
                <div className="confirmation-field">
                  <span>City / Region</span>
                  <strong>{shippedTo}</strong>
                </div>
              )}
              <div className="confirmation-field">
                <span>Customer ID</span>
                <strong>{order.customer?.userid ?? 'CUS-NEW'}</strong>
              </div>
            </div>
          </section>

          <section className="confirmation-block">
            <h2 className="confirmation-block__title">Order summary</h2>
            <div className="confirmation-fields">
              <div className="confirmation-field">
                <span>Items</span>
                <strong>{(order.items ?? []).reduce((n, it) => n + it.quantity, 0)}</strong>
              </div>
              <div className="confirmation-field">
                <span>Subtotal</span>
                <strong>${Number(order.subtotal ?? order.total ?? 0).toFixed(2)}</strong>
              </div>
              <div className="confirmation-field">
                <span>Delivery</span>
                <strong>Free</strong>
              </div>
              <div className="confirmation-field confirmation-field--total">
                <span>Total</span>
                <strong>${Number(order.total ?? 0).toFixed(2)}</strong>
              </div>
            </div>
          </section>
        </div>

        <section className="confirmation-items">
          <h2 className="confirmation-block__title">Items</h2>
          <div className="confirmation-items__list">
            {items.map((item, idx) => {
              const visual = getProductVisual(item.productNameSnapshot ?? 'Product', '')
              return (
                <div key={item.id ?? item.productId ?? idx} className="confirmation-item-row">
                  <div className={`confirmation-item-row__thumb ${visual.gradientClass}`} aria-hidden="true">
                    <span>{visual.icon}</span>
                  </div>
                  <span className="confirmation-item-row__name">{item.productNameSnapshot ?? item.productId}</span>
                  <span className="confirmation-item-row__qty">Qty {item.quantity}</span>
                  <strong className="confirmation-item-row__price">${Number(item.subtotal ?? 0).toFixed(2)}</strong>
                </div>
              )
            })}
          </div>
        </section>

        <div className="confirmation-actions">
          <Link to="/orders" className="btn btn--ghost">View order history</Link>
          <Link to="/products" className="btn btn--primary">Continue shopping</Link>
        </div>
      </div>
    </div>
  )
}
