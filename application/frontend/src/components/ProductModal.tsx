import { useEffect } from 'react'
import { Product } from '../types/Product'
import { getProductVisual } from '../utils/productVisual'

interface Props {
  product: Product
  onClose: () => void
  onAddToCart: (product: Product) => void
}

export default function ProductModal({ product, onClose, onAddToCart }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const visual = getProductVisual(product.name, product.description)
  const inStock = product.stock > 0

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal">
        {/* Visual header */}
        <div className={`modal__visual ${visual.gradientClass}`}>
          <span className="modal__visual-icon" role="img" aria-hidden="true">
            {visual.icon}
          </span>
        </div>

        <div className="modal__header">
          <div>
            <p style={{ fontSize: '.75rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-primary-light)', marginBottom: '.3rem' }}>
              {visual.category}
            </p>
            <h2 className="modal__title" id="modal-title">{product.name}</h2>
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal__body">
          {product.description && (
            <p className="modal__description">{product.description}</p>
          )}

          <div className="modal__pricing">
            <div>
              <p className="modal__price">${product.price.toFixed(2)}</p>
              <p className="modal__price-label">per month</p>
            </div>
            <p className="modal__stock">
              <span className={`modal__stock-dot${inStock ? '' : ' modal__stock-dot--out'}`} />
              {inStock ? `${product.stock} units available` : 'Out of stock'}
            </p>
          </div>

          <button
            className="btn btn--primary btn--full"
            disabled={!inStock}
            onClick={() => { onAddToCart(product); onClose() }}
            style={{ padding: '.75rem' }}
          >
            {inStock ? 'Add to Cart' : 'Out of Stock'}
          </button>
        </div>
      </div>
    </div>
  )
}
