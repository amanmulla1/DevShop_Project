import { Product } from '../types/Product'
import { Customer } from '../types/Customer'
import { Order } from '../types/Order'
import { getBaseUrl } from './config'

const BASE_URL = getBaseUrl()

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = sessionStorage.getItem('devshop.admin.token')
  const headers: Record<string, string> = { ...extra }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

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
  const response = await fetch(`${BASE_URL}/api/admin/products`, { headers: authHeaders() })
  return handleResponse<Product[]>(response)
}

export async function createAdminProduct(product: Partial<Product>) {
  const response = await fetch(`${BASE_URL}/api/admin/products`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(product),
  })
  return handleResponse<Product>(response)
}

export async function updateAdminProduct(id: number, product: Partial<Product>) {
  const response = await fetch(`${BASE_URL}/api/admin/products/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(product),
  })
  return handleResponse<Product>(response)
}

export async function deleteAdminProduct(id: number) {
  const response = await fetch(`${BASE_URL}/api/admin/products/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new Error('Unable to delete product')
  }
}

export async function fetchAdminCustomers(): Promise<Customer[]> {
  const response = await fetch(`${BASE_URL}/api/customers`, { headers: authHeaders() })
  return handleResponse<Customer[]>(response)
}

export async function createAdminCustomer(customer: Partial<Customer>) {
  const response = await fetch(`${BASE_URL}/api/customers`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(customer),
  })
  return handleResponse<Customer>(response)
}

export async function updateAdminCustomer(id: number, customer: Partial<Customer>) {
  const response = await fetch(`${BASE_URL}/api/customers/${id}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(customer),
  })
  return handleResponse<Customer>(response)
}

export async function deleteAdminCustomer(id: number) {
  const response = await fetch(`${BASE_URL}/api/customers/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new Error('Unable to delete customer')
  }
}

export async function fetchAdminOrders(): Promise<Order[]> {
  const response = await fetch(`${BASE_URL}/api/orders`, { headers: authHeaders() })
  return handleResponse<Order[]>(response)
}

export async function updateAdminOrderStatus(id: number, status: string) {
  const response = await fetch(`${BASE_URL}/api/orders/${id}/status`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ status }),
  })
  return handleResponse<Order>(response)
}
