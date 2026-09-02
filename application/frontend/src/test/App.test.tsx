import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import App from '../App'
import * as productApi from '../api/productApi'
import { Product } from '../types/Product'
import { AuthProvider } from '../context/AuthContext'

// Mock the API module so tests don't need a running backend
vi.mock('../api/productApi')

function renderApp() {
  render(
    <AuthProvider>
      <App />
    </AuthProvider>
  )
}

const mockProducts: Product[] = [
  {
    id: 1,
    name: 'Cloud Server T2',
    description: 'Entry-level cloud server.',
    price: 29.99,
    stock: 100,
  },
  {
    id: 2,
    name: 'DevOps Toolkit Pro',
    description: 'CI/CD pipeline toolkit.',
    price: 149.99,
    stock: 50,
  },
  {
    id: 3,
    name: 'Out of Stock Item',
    description: 'Not available.',
    price: 9.99,
    stock: 0,
  },
]

describe('Product listing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('shows loading state while fetching', () => {
    vi.mocked(productApi.fetchProducts).mockReturnValue(new Promise(() => {}))
    renderApp()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/loading products/i)).toBeInTheDocument()
  })

  it('renders products after successful fetch', async () => {
    vi.mocked(productApi.fetchProducts).mockResolvedValue(mockProducts)
    renderApp()

    await waitFor(() => {
      expect(screen.getByText('Cloud Server T2')).toBeInTheDocument()
      expect(screen.getByText('DevOps Toolkit Pro')).toBeInTheDocument()
    })
  })

  it('shows error message when API fails', async () => {
    vi.mocked(productApi.fetchProducts).mockRejectedValue(new Error('Network error'))
    renderApp()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/unable to load products/i)).toBeInTheDocument()
    })
  })

  it('retries fetch when Try Again button is clicked', async () => {
    vi.mocked(productApi.fetchProducts)
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(mockProducts)

    renderApp()

    await waitFor(() => screen.getByRole('alert'))
    fireEvent.click(screen.getByText(/try again/i))

    await waitFor(() => {
      expect(screen.getByText('Cloud Server T2')).toBeInTheDocument()
    })
    expect(productApi.fetchProducts).toHaveBeenCalledTimes(2)
  })
})

describe('Category filtering and navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('filters products by category using the current backend data', async () => {
    vi.mocked(productApi.fetchProducts).mockResolvedValue([
      { id: 1, name: 'Cloud Server T2', description: 'Entry-level cloud server.', price: 29.99, stock: 100 },
      { id: 2, name: 'DevOps Toolkit Pro', description: 'CI/CD pipeline toolkit.', price: 149.99, stock: 50 },
      { id: 3, name: 'Kubernetes Cluster Pack', description: 'Managed cluster bundle.', price: 199.99, stock: 30 },
      { id: 4, name: 'Monitoring Dashboard', description: 'Observability dashboard.', price: 89.99, stock: 40 },
    ])

    renderApp()

    await waitFor(() => screen.getByText('Cloud Server T2'))

    const categories = document.querySelector('#categories')
    expect(categories).not.toBeNull()
    fireEvent.click(within(categories as HTMLElement).getByText('Cloud'))

    await waitFor(() => {
      expect(screen.getByText('1 product available')).toBeInTheDocument()
    })

    expect(screen.getByText('Cloud Server T2')).toBeInTheDocument()
    expect(screen.queryByText('DevOps Toolkit Pro')).not.toBeInTheDocument()
    expect(screen.queryByText('Kubernetes Cluster Pack')).not.toBeInTheDocument()
    expect(screen.queryByText('Monitoring Dashboard')).not.toBeInTheDocument()
  })

  it('renders an About section and exposes a working About link', async () => {
    vi.mocked(productApi.fetchProducts).mockResolvedValue(mockProducts)
    renderApp()

    await waitFor(() => screen.getByText('Cloud Server T2'))

    const nav = screen.getByRole('navigation', { name: /main navigation/i })
    const aboutLink = within(nav).getByRole('link', { name: /^about$/i })
    expect(aboutLink).toHaveAttribute('href', '#about')
    expect(document.getElementById('about')).toBeInTheDocument()
  })

  it('scrolls to the categories section when View Categories is clicked', async () => {
    vi.mocked(productApi.fetchProducts).mockResolvedValue(mockProducts)

    const scrollSpy = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollSpy,
    })

    renderApp()

    await waitFor(() => screen.getByText('Cloud Server T2'))
    fireEvent.click(screen.getByRole('button', { name: /view categories/i }))

    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })
})

describe('Shopping cart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(productApi.fetchProducts).mockResolvedValue(mockProducts)
  })

  async function renderAndWait() {
    renderApp()
    await waitFor(() => screen.getByText('Cloud Server T2'))
  }

  it('cart count starts at zero', async () => {
    await renderAndWait()
    expect(screen.queryByText(/\d+/, { selector: '.navbar__cart-badge' })).not.toBeInTheDocument()
  })

  it('adds a product to cart and shows count in badge', async () => {
    await renderAndWait()

    const addButtons = screen.getAllByText('Add to Cart')
    fireEvent.click(addButtons[0])

    await waitFor(() => {
      const badge = document.querySelector('.navbar__cart-badge')
      expect(badge).toHaveTextContent('1')
    })
  })

  it('Add to Cart is disabled for out-of-stock items', async () => {
    await renderAndWait()
    expect(screen.getByText('Out of Stock')).toBeDisabled()
  })

  it('cart drawer opens and shows added item', async () => {
    await renderAndWait()

    const addButtons = screen.getAllByText('Add to Cart')
    fireEvent.click(addButtons[0])

    fireEvent.click(screen.getByRole('button', { name: /open cart/i }))

    await waitFor(() => {
      expect(screen.getByText('Your Cart')).toBeInTheDocument()
    })

    // Use within() to scope the query to the cart drawer only
    const cartDrawer = screen.getByRole('dialog', { name: /shopping cart/i })
    expect(within(cartDrawer).getByText('Cloud Server T2')).toBeInTheDocument()
  })

  it('removes item from cart', async () => {
    await renderAndWait()

    const addButtons = screen.getAllByText('Add to Cart')
    fireEvent.click(addButtons[0])
    fireEvent.click(screen.getByRole('button', { name: /open cart/i }))

    await waitFor(() => screen.getByText('Your Cart'))
    fireEvent.click(screen.getByText('Remove'))

    await waitFor(() => {
      expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument()
    })
  })

  it('increases and decreases quantity in the cart', async () => {
    await renderAndWait()

    const addButtons = screen.getAllByText('Add to Cart')
    fireEvent.click(addButtons[0])
    fireEvent.click(screen.getByRole('button', { name: /open cart/i }))

    await waitFor(() => screen.getByText('Your Cart'))

    // Scope to the cart drawer to avoid ambiguity with the navbar badge
    const cartDrawer = screen.getByRole('dialog', { name: /shopping cart/i })
    const qtyValue = within(cartDrawer).getByText('1', { selector: '.qty-value' })
    expect(qtyValue).toBeInTheDocument()

    // increase
    fireEvent.click(within(cartDrawer).getByRole('button', { name: /increase quantity/i }))
    await waitFor(() => {
      expect(within(cartDrawer).getByText('2', { selector: '.qty-value' })).toBeInTheDocument()
    })

    // decrease back to 1
    fireEvent.click(within(cartDrawer).getByRole('button', { name: /decrease quantity/i }))
    await waitFor(() => {
      expect(within(cartDrawer).getByText('1', { selector: '.qty-value' })).toBeInTheDocument()
    })
  })
})
