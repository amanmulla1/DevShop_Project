import { API_BASE_URL } from './config'

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

const TOKEN_KEY = 'devshop.customer.token'
const USER_KEY = 'devshop.customer.user'

/**
 * An expired or revoked token returns 401. Clear the stale session and bounce
 * to the login page so the user can re-authenticate instead of seeing
 * confusing per-page errors.
 */
function handleUnauthorized(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USER_KEY)
  } catch {
    // sessionStorage may be disabled; state is cleared on navigation anyway.
  }
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    handleUnauthorized()
  }
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
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return handleResponse<AuthResponse>(response)
}

export async function loginCustomer(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return handleResponse<AuthResponse>(response)
}

export async function fetchOrders(token: string): Promise<import('../types/Order').Order[]> {
  const response = await fetch(`${API_BASE_URL}/customers/me/orders`, {
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
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<CustomerProfile>(response)
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST' })
  } catch {
    // Stateless JWT — the client discards the token regardless.
  }
}
