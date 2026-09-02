import { createContext, useContext, useState, ReactNode } from 'react'
import { AuthResponse, registerCustomer as apiRegister, loginCustomer as apiLogin, logout as apiLogout } from '../api/authApi'

const TOKEN_KEY = 'devshop.customer.token'
const USER_KEY = 'devshop.customer.user'

export interface AuthUser {
  role: 'CUSTOMER' | 'ADMIN'
  userid?: string
  name: string
  email: string
}

interface AuthContextValue {
  user: AuthUser | null
  authenticated: boolean
  token: string | null
  login: (email: string, password: string) => Promise<void>
  register: (payload: Record<string, unknown>) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function readStoredUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser)
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY))

  function persist(auth: AuthResponse) {
    const nextUser: AuthUser = {
      role: auth.role,
      userid: auth.userid,
      name: auth.name,
      email: auth.email,
    }
    sessionStorage.setItem(TOKEN_KEY, auth.token)
    sessionStorage.setItem(USER_KEY, JSON.stringify(nextUser))
    setUser(nextUser)
    setToken(auth.token)
  }

  async function login(email: string, password: string) {
    const auth = await apiLogin(email, password)
    persist(auth)
  }

  async function register(payload: Record<string, unknown>) {
    const auth = await apiRegister(payload as Parameters<typeof apiRegister>[0])
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
    register,
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
