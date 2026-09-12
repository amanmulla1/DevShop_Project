import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import App from '../App'
import * as authApi from '../api/authApi'
import * as adminApi from '../api/adminApi'

// Mock API modules so tests don't need a running backend.
vi.mock('../api/authApi')
vi.mock('../api/adminApi')

const TOKEN_KEY = 'devshop.admin.token'
const USER_KEY = 'devshop.admin.user'

const adminEmail = 'admin@devshop.local'
const adminPassword = 'SuperSecret123!'

function seedAdminSession(role: 'ADMIN' | 'CUSTOMER' = 'ADMIN') {
  sessionStorage.setItem(TOKEN_KEY, 'admin-jwt')
  sessionStorage.setItem(USER_KEY, JSON.stringify({
    role,
    name: role === 'ADMIN' ? 'DevShop Admin' : 'A Customer',
    email: role === 'ADMIN' ? adminEmail : 'customer@example.com',
  }))
}

function renderAdminApp(path = '/') {
  window.history.pushState({}, '', path)
  return render(<App />)
}

describe('Admin login', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('renders the admin login page when not authenticated', () => {
    renderAdminApp('/')
    expect(screen.getByText('DevShop Admin')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('shows an error when credentials are invalid', async () => {
    vi.mocked(authApi.loginAdmin).mockRejectedValue(new Error('Invalid email or password'))

    renderAdminApp('/login')

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: adminEmail } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongpass' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument()
    })
  })

  it('logs in successfully and shows the dashboard', async () => {
    vi.mocked(authApi.loginAdmin).mockResolvedValue({
      token: 'admin-jwt', tokenType: 'Bearer', role: 'ADMIN',
      name: 'DevShop Admin', email: adminEmail,
    })
    vi.mocked(adminApi.fetchAdminProducts).mockResolvedValue([])
    vi.mocked(adminApi.fetchAdminCustomers).mockResolvedValue([])
    vi.mocked(adminApi.fetchAdminOrders).mockResolvedValue([])

    renderAdminApp('/login')

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: adminEmail } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: adminPassword } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('DevShop Dashboard')).toBeInTheDocument()
    })
    expect(authApi.loginAdmin).toHaveBeenCalledWith(adminEmail, adminPassword)
  })
})

describe('Protected admin routes', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
    vi.mocked(adminApi.fetchAdminProducts).mockResolvedValue([])
    vi.mocked(adminApi.fetchAdminCustomers).mockResolvedValue([])
    vi.mocked(adminApi.fetchAdminOrders).mockResolvedValue([])
  })

  it('redirects unauthenticated users to the login page', () => {
    renderAdminApp('/')
    expect(screen.getByText('DevShop Admin')).toBeInTheDocument()
  })

  it('protects the products page', async () => {
    seedAdminSession()
    renderAdminApp('/products')
    await waitFor(() => {
      expect(screen.getByText('Product Management')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: /add product/i })).toBeInTheDocument()
  })

  it('protects the customers page', async () => {
    seedAdminSession()
    renderAdminApp('/customers')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add customer/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('columnheader', { name: /user id/i })).toBeInTheDocument()
  })

  it('protects the orders page', async () => {
    seedAdminSession()
    renderAdminApp('/orders')
    await waitFor(() => {
      expect(screen.getByText('Order Management')).toBeInTheDocument()
    })
  })

  it('does not allow a CUSTOMER-role session into the admin dashboard', async () => {
    seedAdminSession('CUSTOMER')
    renderAdminApp('/')

    // The customer session must be cleared and redirected to login.
    await waitFor(() => {
      expect(screen.getByText('DevShop Admin')).toBeInTheDocument()
    })
    expect(screen.queryByText('DevShop Dashboard')).not.toBeInTheDocument()
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
  })
})

describe('Admin logout', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
    vi.mocked(adminApi.fetchAdminProducts).mockResolvedValue([])
    vi.mocked(adminApi.fetchAdminCustomers).mockResolvedValue([])
    vi.mocked(adminApi.fetchAdminOrders).mockResolvedValue([])
  })

  it('logs out and redirects to the login page', async () => {
    seedAdminSession()
    renderAdminApp('/')

    await waitFor(() => {
      expect(screen.getByText('DevShop Dashboard')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /logout/i }))

    await waitFor(() => {
      expect(screen.getByText('DevShop Admin')).toBeInTheDocument()
      expect(screen.queryByText('DevShop Dashboard')).not.toBeInTheDocument()
    })
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
  })
})
