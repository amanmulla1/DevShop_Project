import { Product } from '../types/Product'
import { Customer } from '../types/Customer'
import { Order } from '../types/Order'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text()
    let message = 'Request failed'
    try {
      const parsed = JSON.parse(text)
      if (parsed?.message) {
        message = parsed.message
      }
    } catch {
      if (text) {
        message = text
      }
    }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

export async function fetchAdminProducts(): Promise<Product[]> {
  const response = await fetch(`${BASE_URL}/api/admin/products`)
  return handleResponse<Product[]>(response)
}

export async function createAdminProduct(product: Partial<Product>) {
  const response = await fetch(`${BASE_URL}/api/admin/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product),
  })
  return handleResponse<Product>(response)
}

export async function updateAdminProduct(id: number, product: Partial<Product>) {
  const response = await fetch(`${BASE_URL}/api/admin/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product),
  })
  return handleResponse<Product>(response)
}

export async function deleteAdminProduct(id: number) {
  const response = await fetch(`${BASE_URL}/api/admin/products/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error('Unable to delete product')
  }
}

export async function fetchAdminCustomers(): Promise<Customer[]> {
  const response = await fetch(`${BASE_URL}/api/customers`)
  return handleResponse<Customer[]>(response)
}

export async function createAdminCustomer(customer: Partial<Customer>) {
  const response = await fetch(`${BASE_URL}/api/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(customer),
  })
  return handleResponse<Customer>(response)
}

export async function updateAdminCustomer(id: number, customer: Partial<Customer>) {
  const response = await fetch(`${BASE_URL}/api/customers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(customer),
  })
  return handleResponse<Customer>(response)
}

export async function deleteAdminCustomer(id: number) {
  const response = await fetch(`${BASE_URL}/api/customers/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    throw new Error('Unable to delete customer')
  }
}

export async function fetchAdminOrders(): Promise<Order[]> {
  const response = await fetch(`${BASE_URL}/api/orders`)
  return handleResponse<Order[]>(response)
}

export async function updateAdminOrderStatus(id: number, status: string) {
  const response = await fetch(`${BASE_URL}/api/orders/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  return handleResponse<Order>(response)
}
