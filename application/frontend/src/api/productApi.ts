import { Product } from '../types/Product'
import { API_BASE_URL } from './config'

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Product not found')
    }
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

/**
 * GET /api/products
 * Returns the full product list.
 */
export async function fetchProducts(): Promise<Product[]> {
  const response = await fetch(`${API_BASE_URL}/products`)
  return handleResponse<Product[]>(response)
}

/**
 * GET /api/products/:id
 * Returns a single product. Throws if not found (404).
 */
export async function fetchProductById(id: number): Promise<Product> {
  const response = await fetch(`${API_BASE_URL}/products/${id}`)
  return handleResponse<Product>(response)
}
