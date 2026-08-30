import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Product } from '../types/Product'
import { useAuth } from '../context/AuthContext'
import { fetchMe } from '../api/authApi'
import { getProductVisual } from '../utils/productVisual'

interface CheckoutProps {
  cart: {
    items: { product: Product; quantity: number }[]
    subtotal: number
    clearCart: () => void
  }
}

type CredentialField = 'name' | 'email' | 'phone'

export default function CheckoutPage({ cart }: CheckoutProps) {
  const navigate = useNavigate()
  const { token, user, authenticated } = useAuth()
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    paymentMethod: 'PAY_ON_DELIVERY',
  })
  // Credentials locked from the account are read-only; missing ones are editable.
  const [locked, setLocked] = useState<Record<CredentialField, boolean>>({ name: false, email: false, phone: false })
  const [credentialField, setCredentialField] = useState<CredentialField | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const itemCount = useMemo(() => cart.items.reduce((sum, item) => sum + item.quantity, 0), [cart.items])

  useEffect(() => {
    let mounted = true
    async function prefill() {
      if (!token) return
      try {
        const profile = await fetchMe(token)
        if (!mounted) return
        setForm((prev) => ({
          ...prev,
          name: profile.name ?? '',
          email: profile.email ?? '',
          phone: profile.phone ?? '',
          address: profile.address ?? '',
          city: profile.city ?? '',
          state: profile.state ?? '',
          postalCode: profile.postalCode ?? '',
        }))
        setLocked({
          name: Boolean(profile.name),
          email: Boolean(profile.email),
          phone: Boolean(profile.phone),
        })
      } catch {
        // If profile fetch fails, keep whatever the user has entered.
      }
    }
    prefill()
    return () => {
      mounted = false
    }
  }, [token, user])

  if (!authenticated) {
    return <Navigate to="/login" replace />
  }

  function updateField(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleCredentialClick(field: CredentialField) {
    if (locked[field]) {
      setCredentialField(field)
    }
  }

  const credentialLabels: Record<CredentialField, string> = {
    name: 'Full name',
    email: 'Email',
    phone: 'Phone',
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    const missing = (['name', 'email', 'phone'] as CredentialField[])
      .filter(f => !locked[f] && !form[f].trim())
    if (missing.length > 0) {
      setError('Please complete the credential fields below to continue.')
      return
    }

    if (!form.address || !form.city || !form.state || !form.postalCode) {
      setError('Please complete all delivery fields.')
      return
    }

    if (form.paymentMethod === 'ONLINE_PAYMENT') {
      setError('Online payment is coming soon.')
      return
    }

    setSubmitting(true)

    try {
      const payload = {
        customer: {
          name: form.name,
          email: form.email,
          phone: form.phone,
        },
        items: cart.items.map(({ product, quantity }) => ({
          productId: product.id,
          quantity,
        })),
        paymentMethod: 'PAY_ON_DELIVERY',
        address: form.address,
        city: form.city,
        state: form.state,
        postalCode: form.postalCode,
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch('http://localhost:8080/api/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.message || 'Unable to place order.')
      }

      cart.clearCart()
      navigate('/checkout/success', { state: { order: data } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to place order.')
    } finally {
      setSubmitting(false)
    }
  }

  if (cart.items.length === 0) {
    return (
      <div className="checkout-empty">
        <div className="checkout-empty__icon" aria-hidden="true">🛒</div>
        <h2>Your cart is empty</h2>
        <p>Add a few products before heading to checkout.</p>
        <button className="btn btn--primary" onClick={() => navigate('/products')}>Continue Shopping</button>
      </div>
    )
  }

  function renderCredentialField(field: CredentialField) {
    const label = credentialLabels[field]
    const isLocked = locked[field]
    const type = field === 'email' ? 'email' : 'text'

    if (isLocked) {
      return (
        <label className="checkout-field checkout-field--credential">
          <span className="checkout-field__label-row">
            {label}
            <span className="checkout-field__lock" title="Locked from your account">
              <span aria-hidden="true">🔒</span> Account
            </span>
          </span>
          <button
            type="button"
            className="checkout-field__value"
            onClick={() => handleCredentialClick(field)}
          >
            {form[field] || '—'}
          </button>
          <small className="checkout-field__hint">
            Changing your {label.toLowerCase()}? Contact DevShop Support.
          </small>
        </label>
      )
    }

    return (
      <label className="checkout-field">
        <span>{label} <em className="checkout-field__req">*</em></span>
        <input
          type={type}
          value={form[field]}
          onChange={(e) => updateField(field, e.target.value)}
          placeholder={field === 'phone' ? 'Add your phone number' : `Add your ${label.toLowerCase()}`}
          required
        />
        <small className="checkout-field__hint">We need this to complete your order.</small>
      </label>
    )
  }

  return (
    <div className="checkout-page">
      <button
        type="button"
        className="checkout-back"
        onClick={() => navigate(-1)}
      >
        <span className="checkout-back__arrow" aria-hidden="true">←</span>
        Back
      </button>

      <header className="checkout-head">
        <p className="checkout-head__eyebrow">DevShop Store</p>
        <h1 className="checkout-head__title">Checkout</h1>
        <p className="checkout-head__subtitle">
          Complete your order — pay on delivery, right at your door.
        </p>
      </header>

      <div className="checkout-page__wrap">
        <div className="checkout-card">
          <form onSubmit={handleSubmit} className="checkout-form">
            <section className="checkout-section">
              <div className="checkout-section__head">
                <span className="checkout-section__step" aria-hidden="true">1</span>
                <div>
                  <h2>Customer</h2>
                  <p>Your account credentials are applied automatically</p>
                </div>
              </div>
              <div className="form-grid">
                {renderCredentialField('name')}
                {renderCredentialField('email')}
                {renderCredentialField('phone')}
              </div>
            </section>

            <section className="checkout-section">
              <div className="checkout-section__head">
                <span className="checkout-section__step" aria-hidden="true">2</span>
                <div>
                  <h2>Delivery</h2>
                  <p>Where to ship your order</p>
                </div>
              </div>
              <div className="form-grid">
                <label className="checkout-field checkout-field--full">
                  <span>Address</span>
                  <input value={form.address} onChange={(e) => updateField('address', e.target.value)} placeholder="Street address" />
                </label>
                <label className="checkout-field">
                  <span>City</span>
                  <input value={form.city} onChange={(e) => updateField('city', e.target.value)} placeholder="City" />
                </label>
                <label className="checkout-field">
                  <span>State</span>
                  <input value={form.state} onChange={(e) => updateField('state', e.target.value)} placeholder="State" />
                </label>
                <label className="checkout-field">
                  <span>Postal code</span>
                  <input value={form.postalCode} onChange={(e) => updateField('postalCode', e.target.value)} placeholder="400 001" />
                </label>
              </div>
            </section>

            <section className="checkout-section">
              <div className="checkout-section__head">
                <span className="checkout-section__step" aria-hidden="true">3</span>
                <div>
                  <h2>Payment</h2>
                  <p>How you'd like to pay</p>
                </div>
              </div>
              <div className="payment-options">
                <label className={`payment-option ${form.paymentMethod === 'PAY_ON_DELIVERY' ? 'payment-option--selected' : ''}`}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="PAY_ON_DELIVERY"
                    checked={form.paymentMethod === 'PAY_ON_DELIVERY'}
                    onChange={(e) => updateField('paymentMethod', e.target.value)}
                  />
                  <span className="payment-option__icon" aria-hidden="true">💵</span>
                  <span className="payment-option__body">
                    <strong>Pay on Delivery</strong>
                    <small>Cash or card when it arrives</small>
                  </span>
                  <span className="payment-option__radio" aria-hidden="true" />
                </label>

                <label className={`payment-option payment-option--disabled ${form.paymentMethod === 'ONLINE_PAYMENT' ? 'payment-option--selected' : ''}`}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="ONLINE_PAYMENT"
                    checked={form.paymentMethod === 'ONLINE_PAYMENT'}
                    onChange={(e) => updateField('paymentMethod', e.target.value)}
                  />
                  <span className="payment-option__icon" aria-hidden="true">💳</span>
                  <span className="payment-option__body">
                    <strong>Online Payment</strong>
                    <small>Coming soon</small>
                  </span>
                  <span className="payment-option__radio" aria-hidden="true" />
                </label>
              </div>
            </section>

            {error && <div className="checkout-error" role="alert">{error}</div>}

            <button
              type="submit"
              className="btn btn--primary btn--full checkout-submit"
              disabled={submitting || form.paymentMethod === 'ONLINE_PAYMENT'}
            >
              {form.paymentMethod === 'ONLINE_PAYMENT'
                ? 'Coming Soon'
                : submitting
                  ? 'Placing Order…'
                  : `Place Order · ${cart.subtotal.toFixed(2)}`}
            </button>
          </form>
        </div>

        <aside className="checkout-summary">
          <div className="checkout-summary__inner">
            <h2>Order Summary</h2>

            <ul className="checkout-summary__items">
              {cart.items.map(({ product, quantity }) => {
                const visual = getProductVisual(product.name, product.description)
                return (
                  <li key={product.id} className="checkout-line-item">
                    <div className={`checkout-line-item__thumb ${visual.gradientClass}`} aria-hidden="true">
                      <span>{visual.icon}</span>
                    </div>
                    <div className="checkout-line-item__info">
                      <strong>{product.name}</strong>
                      <span>{quantity} × ${product.price.toFixed(2)}</span>
                    </div>
                    <span className="checkout-line-item__price">${(product.price * quantity).toFixed(2)}</span>
                  </li>
                )
              })}
            </ul>

            <div className="checkout-summary__rows">
              <div className="checkout-total-row">
                <span>Items ({itemCount})</span>
                <strong>${cart.subtotal.toFixed(2)}</strong>
              </div>
              <div className="checkout-total-row">
                <span>Delivery</span>
                <strong>Free</strong>
              </div>
              <div className="checkout-total-row checkout-total-row--final">
                <span>Total</span>
                <strong>${cart.subtotal.toFixed(2)}</strong>
              </div>
            </div>

            <div className="checkout-summary__note">
              <span aria-hidden="true">🔒</span>
              <p>Your details are safe with us. Keyed once, used to ship your order.</p>
            </div>
          </div>
        </aside>
      </div>

      {credentialField && (
        <div className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="credential-popup-title">
          <div className="checkout-modal__backdrop" onClick={() => setCredentialField(null)} />
          <div className="checkout-modal__card">
            <div className="checkout-modal__icon" aria-hidden="true">🔒</div>
            <h2 id="credential-popup-title">Contact DevShop Support</h2>
            <p>
              Your <strong>{credentialLabels[credentialField].toLowerCase()}</strong> is tied to your account and
              cannot be changed here for security reasons.
            </p>
            <p>
              To request a change, please contact <strong>DevShop Support</strong> and we'll verify your identity
              before updating it.
            </p>
            <button type="button" className="btn btn--primary" onClick={() => setCredentialField(null)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
