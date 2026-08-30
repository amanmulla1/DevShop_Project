const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export interface AuthUser {
  role: 'CUSTOMER' | 'ADMIN'
  userid?: string
  name: string
  email: string
}

export interface AuthResponse {
  token: string
  tokenType: string
  role: 'CUSTOMER' | 'ADMIN'
  userid?: string
  name: string
  email: string
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message = data?.message || 'Request failed'
    throw new Error(message)
  }
  return data as T
}

export async function registerCustomer(payload: {
  name: string
  email: string
  phone?: string
  password: string
  confirmPassword: string
  deliveryAddress?: string
  city?: string
  state?: string
  postalCode?: string
}): Promise<AuthResponse> {
  const response = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleResponse<AuthResponse>(response)
}

export async function loginCustomer(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return handleResponse<AuthResponse>(response)
}

export async function fetchOrders(token: string): Promise<import('../types/Order').Order[]> {
  const response = await fetch(`${BASE_URL}/api/customers/me/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<import('../types/Order').Order[]>(response)
}

export interface CustomerProfile extends AuthUser {
  phone?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
}

/**
 * Fetches the authenticated customer's full (safe) profile from the backend.
 * The identity is derived server-side from the JWT — never a client id.
 */
export async function fetchMe(token: string): Promise<CustomerProfile> {
  const response = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<CustomerProfile>(response)
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/auth/logout`, { method: 'POST' })
  } catch {
    // Stateless JWT — the client discards the token regardless.
  }
}
