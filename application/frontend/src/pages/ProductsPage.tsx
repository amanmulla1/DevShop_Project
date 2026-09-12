import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Product } from '../types/Product'
import { fetchProducts } from '../api/productApi'
import Hero from '../components/Hero'
import Categories from '../components/Categories'
import ProductGrid from '../components/ProductGrid'
import ProductModal from '../components/ProductModal'
import Loading from '../components/Loading'
import ErrorMessage from '../components/ErrorMessage'
import Footer from '../components/Footer'
import { getProductCategory, PRODUCT_CATEGORIES } from '../utils/productVisual'

interface Props {
  onAddToCart: (product: Product) => void
}

type Status = 'idle' | 'loading' | 'success' | 'error'

export default function ProductsPage({ onAddToCart }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('All Products')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const productsRef = useRef<HTMLDivElement>(null)
  const categoriesRef = useRef<HTMLElement>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const data = await fetchProducts()
      setProducts(data)
      setSelectedCategory('All Products')
      setStatus('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(PRODUCT_CATEGORIES.map(category => [category, 0])) as Record<string, number>

    products.forEach(product => {
      const category = getProductCategory(product.name, product.description)
      counts[category] = (counts[category] ?? 0) + 1
    })

    return counts
  }, [products])

  const categoryItems = useMemo(() => {
    const items = [
      { name: 'All Products', count: products.length, icon: '✨' },
      ...PRODUCT_CATEGORIES.map(category => ({
        name: category,
        count: categoryCounts[category] ?? 0,
        icon: '•',
      })),
    ]

    return items
  }, [categoryCounts, products.length])

  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'All Products') {
      return products
    }

    return products.filter(product => getProductCategory(product.name, product.description) === selectedCategory)
  }, [products, selectedCategory])

  function scrollToProducts() {
    productsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function scrollToCategories() {
    categoriesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <main className="page">
      {/* Hero */}
      <Hero onBrowse={scrollToProducts} onViewCategories={scrollToCategories} totalProducts={products.length} />

      {/* Categories */}
      <Categories
        categories={categoryItems}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        ref={categoriesRef}
      />

      {/* Products section */}
      <section className="products-section" id="products" ref={productsRef}>
        <div className="products-section__inner">
          <div className="products-section__header">
            <div>
              <p className="section-eyebrow">Featured Products</p>
              <h2 className="section-title">
                {status === 'success'
                  ? `${filteredProducts.length} product${filteredProducts.length !== 1 ? 's' : ''} available`
                  : 'Our Catalogue'}
              </h2>
            </div>
          </div>

          {status === 'loading' && <Loading />}
          {status === 'error' && (
            <ErrorMessage message={error ?? undefined} onRetry={load} />
          )}
          {status === 'success' && (
            <ProductGrid
              products={filteredProducts}
              onSelect={setSelectedProduct}
              onAddToCart={onAddToCart}
            />
          )}
        </div>
      </section>

      <section className="about-section" id="about">
        <div className="about-section__inner">
          <div className="section-header">
            <p className="section-eyebrow">About DevShop</p>
            <h2 className="section-title">A demo marketplace for modern cloud operations</h2>
          </div>

          <div className="about-section__content">
            <div className="about-section__copy">
              <p>
                DevShop is a demo marketplace for modern cloud and DevOps infrastructure solutions.
                It brings commonly used cloud, Kubernetes, CI/CD, container, and observability tooling
                into one simple platform for rapid exploration and experimentation.
              </p>
              <p>
                This project is designed to showcase a complete frontend, API integration, and cart flow
                for a fictional SaaS-style product catalog, rather than representing an actual operating business.
              </p>
            </div>

            <div className="about-section__stats" aria-label="Project demo statistics">
              <div>
                <strong>4+</strong>
                <span>Infrastructure Products</span>
              </div>
              <div>
                <strong>6</strong>
                <span>Technology Categories</span>
              </div>
              <div>
                <strong>99.9%</strong>
                <span>Demo Platform Availability</span>
              </div>
              <div>
                <strong>24/7</strong>
                <span>Automation Mindset</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />

      {/* Product detail modal */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={product => {
            onAddToCart(product)
            setSelectedProduct(null)
          }}
        />
      )}
    </main>
  )
}
