import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import LoginPage from '../pages/LoginPage'
import RegisterPage from '../pages/RegisterPage'
import AccountPage from '../pages/AccountPage'
import OrderHistoryPage from '../pages/OrderHistoryPage'
import CheckoutPage from '../pages/CheckoutPage'
import App from '../App'
import * as authApi from '../api/authApi'
import type { CustomerProfile } from '../api/authApi'
import * as productApi from '../api/productApi'
import { Product } from '../types/Product'

// Mock the API module so tests don't need a running backend.
vi.mock('../api/authApi')
vi.mock('../api/productApi')

const TOKEN_KEY = 'devshop.customer.token'
const USER_KEY = 'devshop.customer.user'

const profile: CustomerProfile = {
  role: 'CUSTOMER',
  userid: 'CUS-7A92F1CD',
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '555-1234',
  address: '1 Main St',
  city: 'Springfield',
  state: 'IL',
  postalCode: '62701',
}

const mockProducts: Product[] = [
  { id: 1, name: 'Cloud Server T2', description: 'Entry-level cloud.', price: 29.99, stock: 100 },
]

function renderWithAuth(ui: ReactNode) {
  return render(
    <AuthProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </AuthProvider>
  )
}

function renderAuthFlow(initial = '/login') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/" element={<div>DevShop Home</div>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  )
}

// Renders a page that may redirect to /login, with the login route defined.
function renderPageWithLoginRoute(ui: ReactNode) {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={ui} />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  )
}

function seedAuthenticated() {
  sessionStorage.setItem(TOKEN_KEY, 'jwt-token')
  sessionStorage.setItem(USER_KEY, JSON.stringify({
    role: 'CUSTOMER',
    userid: profile.userid,
    name: profile.name,
    email: profile.email,
  }))
}

describe('Login page', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('renders email/password fields and a link to register', () => {
    renderWithAuth(<LoginPage />)
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute('href', '/register')
  })

  it('redirects to home on successful login', async () => {
    vi.mocked(authApi.loginCustomer).mockResolvedValue({
      token: 'jwt-token', tokenType: 'Bearer', role: 'CUSTOMER',
      userid: profile.userid, name: profile.name, email: profile.email,
    })
    vi.mocked(authApi.fetchMe).mockResolvedValue(profile)

    renderAuthFlow('/login')

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: profile.email } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'SecurePass123!' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('DevShop Home')).toBeInTheDocument()
    })
    expect(authApi.loginCustomer).toHaveBeenCalledWith(profile.email, 'SecurePass123!')
  })

  it('shows an error message on failed login', async () => {
    vi.mocked(authApi.loginCustomer).mockRejectedValue(new Error('Invalid email or password'))

    renderWithAuth(<LoginPage />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: profile.email } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongpass' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument()
    })
  })
})

describe('Register page', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('renders all required registration fields', () => {
    renderWithAuth(<RegisterPage />)
    expect(screen.getByText('Create your account')).toBeInTheDocument()
    expect(screen.getByLabelText('Full Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Phone')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument()
    expect(screen.getByLabelText('Delivery Address')).toBeInTheDocument()
    expect(screen.getByLabelText('City')).toBeInTheDocument()
    expect(screen.getByLabelText('State')).toBeInTheDocument()
    expect(screen.getByLabelText('Postal Code')).toBeInTheDocument()
  })

  it('rejects mismatched passwords', async () => {
    renderWithAuth(<RegisterPage />)

    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Jane Doe' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: profile.email } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'SecurePass123!' } })
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'Different123!' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
    })
    expect(authApi.registerCustomer).not.toHaveBeenCalled()
  })

  it('shows client-side error for too-short password', async () => {
    renderWithAuth(<RegisterPage />)

    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Jane Doe' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: profile.email } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
    })
  })

  it('registers successfully and redirects to home', async () => {
    vi.mocked(authApi.registerCustomer).mockResolvedValue({
      token: 'jwt-token', tokenType: 'Bearer', role: 'CUSTOMER',
      userid: profile.userid, name: profile.name, email: profile.email,
    })
    vi.mocked(authApi.fetchMe).mockResolvedValue(profile)

    renderAuthFlow('/register')

    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: profile.name } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: profile.email } })
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: profile.phone } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'SecurePass123!' } })
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'SecurePass123!' } })
    fireEvent.change(screen.getByLabelText('Delivery Address'), { target: { value: profile.address } })
    fireEvent.change(screen.getByLabelText('City'), { target: { value: profile.city } })
    fireEvent.change(screen.getByLabelText('State'), { target: { value: profile.state } })
    fireEvent.change(screen.getByLabelText('Postal Code'), { target: { value: profile.postalCode } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText('DevShop Home')).toBeInTheDocument()
    })
    expect(authApi.registerCustomer).toHaveBeenCalledTimes(1)
  })
})

describe('Account page', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('redirects to /login when not authenticated', () => {
    renderPageWithLoginRoute(<AccountPage />)
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.queryByText(/my account/i)).not.toBeInTheDocument()
  })

  it('displays userid and full profile when authenticated', async () => {
    seedAuthenticated()
    vi.mocked(authApi.fetchMe).mockResolvedValue(profile)

    renderWithAuth(<AccountPage />)

    await waitFor(() => {
      expect(screen.getByText(profile.userid!)).toBeInTheDocument()
    })
    expect(screen.getByText(profile.name)).toBeInTheDocument()
    expect(screen.getByText(profile.email)).toBeInTheDocument()
    expect(screen.getByText(profile.phone!)).toBeInTheDocument()
    expect(screen.getByText(`${profile.address!}, ${profile.city!}, ${profile.state!}, ${profile.postalCode!}`)).toBeInTheDocument()
  })
})

describe('Order history', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('redirects to /login when not authenticated', () => {
    renderPageWithLoginRoute(<OrderHistoryPage />)
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  it('loads and displays the current user orders', async () => {
    seedAuthenticated()
    vi.mocked(authApi.fetchOrders).mockResolvedValue([
      {
        id: 1,
        orderNumber: 'ORD-ABC123',
        status: 'PENDING',
        paymentMethod: 'PAY_ON_DELIVERY',
        total: 29.99,
        items: [{ productNameSnapshot: 'Cloud Server T2', quantity: 1, unitPrice: 29.99, subtotal: 29.99 }],
      },
    ])

    renderWithAuth(<OrderHistoryPage />)

    await waitFor(() => {
      expect(screen.getByText('ORD-ABC123')).toBeInTheDocument()
    })
    expect(screen.getByText('Cloud Server T2')).toBeInTheDocument()
  })
})

describe('Authenticated checkout', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('prefills customer info when logged in', async () => {
    seedAuthenticated()
    vi.mocked(authApi.fetchMe).mockResolvedValue(profile)

    const cart = {
      items: [{ product: mockProducts[0], quantity: 2 }],
      subtotal: 59.98,
      clearCart: vi.fn(),
    }

    // Need CheckoutPage within a router (uses useNavigate) + Auth context.
    renderWithAuth(<CheckoutPage cart={cart} />)

    await waitFor(() => {
      expect(screen.getByText(profile.name)).toBeInTheDocument()
    })
    // Credential fields are read-only (shown as account value, not editable).
    expect(screen.getByText(profile.name).tagName).toBe('BUTTON')
    expect(screen.getByText(profile.email)).toBeInTheDocument()
    expect(screen.getByText(profile.phone!)).toBeInTheDocument()
    expect(screen.getByDisplayValue(profile.address!)).toBeInTheDocument()
    expect(screen.getByDisplayValue(profile.city!)).toBeInTheDocument()
    expect(screen.getByDisplayValue(profile.state!)).toBeInTheDocument()
    expect(screen.getByDisplayValue(profile.postalCode!)).toBeInTheDocument()
  })
})

describe('Logout', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
    vi.mocked(productApi.fetchProducts).mockResolvedValue(mockProducts)
  })

  it('logs out and clears auth state', async () => {
    seedAuthenticated()

    // Render full App so the Navbar (with logout) is present.
    const scrollSpy = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollSpy,
    })

    render(
      <AuthProvider>
        <App />
      </AuthProvider>
    )

    await waitFor(() => screen.getByText('Cloud Server T2'))

    // Logged in navbar shows an account menu button that opens Logout.
    const accountButton = screen.getByRole('button', { name: /account menu/i })
    expect(accountButton).toBeInTheDocument()
    fireEvent.click(accountButton)

    const logoutItem = screen.getByRole('menuitem', { name: /logout/i })
    expect(logoutItem).toBeInTheDocument()

    fireEvent.click(logoutItem)

    // After logout, the navbar shows "Sign in" again instead of Logout.
    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: /logout/i })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument()
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull()
  })
})
