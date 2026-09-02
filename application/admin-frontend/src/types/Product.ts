/**
 * Mirrors the backend Product entity:
 *   id: Long        → number
 *   name: String    → string
 *   description: String → string | null  (column has no NOT NULL constraint)
 *   price: BigDecimal → number
 *   stock: Integer  → number
 */
export interface Product {
  id: number
  name: string
  description: string | null
  category?: string | null
  price: number
  stock: number
}
