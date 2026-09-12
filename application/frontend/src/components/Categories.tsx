import { forwardRef } from 'react'
import { CATEGORY_META } from '../utils/productVisual'

export interface CategoryItem {
  name: string
  count: number
  icon: string
}

interface Props {
  categories: CategoryItem[]
  selectedCategory: string
  onSelectCategory: (category: string) => void
}

const Categories = forwardRef<HTMLElement, Props>(function Categories(
  { categories, selectedCategory, onSelectCategory },
  ref,
) {
  return (
    <section className="categories" id="categories" ref={ref}>
      <div className="categories__inner">
        <div className="section-header">
          <p className="section-eyebrow">Browse by Category</p>
          <h2 className="section-title">Everything in your DevOps stack</h2>
          <p className="section-subtitle">
            From cloud compute to full observability — find what your team needs.
          </p>
        </div>

        <div className="categories__grid">
          {categories.map(cat => {
            const isSelected = selectedCategory === cat.name
            const isAllProducts = cat.name === 'All Products'
            const icon = isAllProducts ? '✨' : (CATEGORY_META[cat.name]?.icon ?? '📦')

            return (
              <button
                key={cat.name}
                type="button"
                className={`category-card ${isSelected ? 'category-card--active' : ''}`}
                onClick={() => onSelectCategory(cat.name)}
                aria-pressed={isSelected}
              >
                <span className="category-card__icon" role="img" aria-label={cat.name}>
                  {icon}
                </span>
                <span className="category-card__name">{cat.name}</span>
                <span className="category-card__count">
                  {cat.count} product{cat.count === 1 ? '' : 's'}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
})

export default Categories
