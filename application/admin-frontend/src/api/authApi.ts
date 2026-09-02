import { API_BASE_URL } from './config'

export interface AdminAuthResponse {
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
    throw new Error(data?.message || 'Request failed')
  }
  return data as T
}

export async function loginAdmin(email: string, password: string): Promise<AdminAuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return handleResponse<AdminAuthResponse>(response)
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST' })
  } catch {
    // Stateless JWT — the client discards the token regardless.
  }
}
