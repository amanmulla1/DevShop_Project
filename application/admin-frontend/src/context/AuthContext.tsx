import { createContext, useContext, useState, ReactNode } from 'react'
import { loginAdmin as apiLogin, logout as apiLogout, AdminAuthResponse } from '../api/authApi'

const TOKEN_KEY = 'devshop.admin.token'
const USER_KEY = 'devshop.admin.user'

export interface AdminUser {
  role: 'CUSTOMER' | 'ADMIN'
  name: string
  email: string
}

interface AuthContextValue {
  user: AdminUser | null
  authenticated: boolean
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function readStoredUser(): AdminUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AdminUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(readStoredUser)
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY))

  function persist(auth: AdminAuthResponse) {
    const nextUser: AdminUser = { role: auth.role, name: auth.name, email: auth.email }
    sessionStorage.setItem(TOKEN_KEY, auth.token)
    sessionStorage.setItem(USER_KEY, JSON.stringify(nextUser))
    setUser(nextUser)
    setToken(auth.token)
  }

  async function login(email: string, password: string) {
    const auth = await apiLogin(email, password)
    persist(auth)
  }

  function logout() {
    apiLogout()
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USER_KEY)
    setUser(null)
    setToken(null)
  }

  const value: AuthContextValue = {
    user,
    authenticated: !!token && !!user,
    token,
    login,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
