import { CartItem } from '../hooks/useCart'
import { getProductVisual } from '../utils/productVisual'

interface Props {
  items: CartItem[]
  subtotal: number
  onClose: () => void
  onIncrease: (productId: number, maxStock: number) => void
  onDecrease: (productId: number) => void
  onRemove: (productId: number) => void
  onCheckout: () => void
}

export default function CartDrawer({
  items,
  subtotal,
  onClose,
  onIncrease,
  onDecrease,
  onRemove,
  onCheckout,
}: Props) {
  const itemCount = items.reduce((s, i) => s + i.quantity, 0)

  return (
    <>
      <div className="cart-overlay" onClick={onClose} aria-hidden="true" />

      {/* aria-label="Shopping cart" preserved for tests */}
      <aside className="cart-drawer" role="dialog" aria-modal="true" aria-label="Shopping cart">

        <div className="cart-drawer__header">
          <div>
            {/* "Your Cart" text preserved for tests */}
            <h2 className="cart-drawer__title">Your Cart</h2>
            <p className="cart-drawer__count">
              {itemCount === 0 ? 'No items' : `${itemCount} item${itemCount !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Close cart">✕</button>
        </div>

        <div className="cart-drawer__body">
          {items.length === 0 ? (
            <div className="cart-drawer__empty">
              <span className="cart-drawer__empty-icon" aria-hidden="true">🛒</span>
              {/* "Your cart is empty." preserved for tests */}
              <p style={{ fontWeight: 600, color: 'var(--c-text-muted)' }}>Your cart is empty.</p>
              <p style={{ fontSize: '.845rem', color: 'var(--c-text-dim)' }}>
                Add a product to get started.
              </p>
            </div>
          ) : (
            items.map(({ product, quantity }) => {
              const visual = getProductVisual(product.name, product.description)
              return (
                <div key={product.id} className="cart-item">
                  {/* Product thumbnail */}
                  <div className={`cart-item__thumb ${visual.gradientClass}`}>
                    <span aria-hidden="true">{visual.icon}</span>
                  </div>

                  <div className="cart-item__info">
                    {/* cart-item__name class preserved */}
                    <p className="cart-item__name">{product.name}</p>
                    <p className="cart-item__unit-price">${product.price.toFixed(2)}/mo each</p>

                    {/* Quantity controls — all aria-labels and class names preserved for tests */}
                    <div className="cart-item__controls">
                      <button
                        className="qty-btn"
                        onClick={() => onDecrease(product.id)}
                        aria-label="Decrease quantity"
                      >−</button>
                      {/* qty-value class preserved for tests */}
                      <span className="qty-value">{quantity}</span>
                      <button
                        className="qty-btn"
                        onClick={() => onIncrease(product.id, product.stock)}
                        disabled={quantity >= product.stock}
                        aria-label="Increase quantity"
                      >+</button>
                    </div>
                  </div>

                  <div className="cart-item__right">
                    <span className="cart-item__line-price">
                      ${(product.price * quantity).toFixed(2)}
                    </span>
                    {/* "Remove" text preserved for tests */}
                    <button
                      className="cart-item__remove"
                      onClick={() => onRemove(product.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {items.length > 0 && (
          <div className="cart-drawer__footer">
            <div className="cart-drawer__line">
              <span>Subtotal ({itemCount} item{itemCount !== 1 ? 's' : ''})</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="cart-drawer__line">
              <span>Estimated tax</span>
              <span>—</span>
            </div>
            <div className="cart-drawer__total">
              <span>Total</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            {/* Checkout navigates to the checkout page */}
            <button className="btn btn--primary btn--full" onClick={onCheckout} style={{ marginTop: '.25rem' }}>
              Proceed to Checkout
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
