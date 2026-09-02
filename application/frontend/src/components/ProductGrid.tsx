import { Product } from '../types/Product'
import ProductCard from './ProductCard'

interface Props {
  products: Product[]
  onSelect: (product: Product) => void
  onAddToCart: (product: Product) => void
}

export default function ProductGrid({ products, onSelect, onAddToCart }: Props) {
  if (products.length === 0) {
    return (
      <div className="error-message">
        <span className="error-message__icon">📦</span>
        <p className="error-message__title">No products available</p>
        <p className="error-message__text">Check back soon.</p>
      </div>
    )
  }

  return (
    <div className="product-grid">
      {products.map(product => (
        <ProductCard
          key={product.id}
          product={product}
          onSelect={onSelect}
          onAddToCart={onAddToCart}
        />
      ))}
    </div>
  )
}
