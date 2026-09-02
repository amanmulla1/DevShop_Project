import { Product } from '../types/Product'
import { getProductVisual } from '../utils/productVisual'

interface Props {
  product: Product
  onSelect: (product: Product) => void
  onAddToCart: (product: Product) => void
}

function stockLabel(stock: number): { text: string; className: string } {
  if (stock === 0) return { text: 'Out of stock', className: 'product-card__stock--out' }
  if (stock <= 5) return { text: `Only ${stock} left`, className: 'product-card__stock--low' }
  return { text: `${stock} in stock`, className: '' }
}

export default function ProductCard({ product, onSelect, onAddToCart }: Props) {
  const { text, className } = stockLabel(product.stock)
  const visual = getProductVisual(product.name, product.description)

  return (
    <article className="product-card" onClick={() => onSelect(product)}>
      <div className={`product-card__visual ${visual.gradientClass}`}>
        <span className="product-card__visual-icon" role="img" aria-hidden="true">
          {visual.icon}
        </span>
        <span className="product-card__badge">{visual.category}</span>
      </div>

      <div className="product-card__body">
        <h2 className="product-card__name">{product.name}</h2>
        {product.description && (
          <p className="product-card__description">{product.description}</p>
        )}
        <div className="product-card__meta">
          <span className="product-card__price">
            ${product.price.toFixed(2)}
            <span className="product-card__price-mo">/mo</span>
          </span>
          <span className={`product-card__stock ${className}`}>{text}</span>
        </div>
      </div>

      <div className="product-card__footer">
        <button
          className="btn btn--primary btn--full"
          disabled={product.stock === 0}
          onClick={e => {
            e.stopPropagation()
            onAddToCart(product)
          }}
        >
          {product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
        </button>
      </div>
    </article>
  )
}
