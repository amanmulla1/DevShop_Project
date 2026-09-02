import { FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RegisterPage() {
  const { register, authenticated } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    deliveryAddress: '',
    city: '',
    state: '',
    postalCode: '',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (authenticated) {
    return <Navigate to="/" replace />
  }

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await register(form)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create account.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-card--wide">
        <h1>Create your account</h1>
        <p className="auth-subtitle">Join DevShop to track orders and check out faster.</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Full Name
            <input value={form.name} onChange={(e) => updateField('name', e.target.value)} required autoComplete="name" />
          </label>

          <div className="form-grid">
            <label>
              Email
              <input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} required autoComplete="email" />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
            </label>
          </div>

          <div className="form-grid">
            <label>
              Password
              <input type="password" value={form.password} onChange={(e) => updateField('password', e.target.value)} required autoComplete="new-password" />
            </label>
            <label>
              Confirm Password
              <input type="password" value={form.confirmPassword} onChange={(e) => updateField('confirmPassword', e.target.value)} required autoComplete="new-password" />
            </label>
          </div>

          <fieldset className="auth-section">
            <legend>Delivery Address</legend>
            <label>
              Delivery Address
              <input value={form.deliveryAddress} onChange={(e) => updateField('deliveryAddress', e.target.value)} />
            </label>
            <div className="form-grid">
              <label>
                City
                <input value={form.city} onChange={(e) => updateField('city', e.target.value)} />
              </label>
              <label>
                State
                <input value={form.state} onChange={(e) => updateField('state', e.target.value)} />
              </label>
              <label>
                Postal Code
                <input value={form.postalCode} onChange={(e) => updateField('postalCode', e.target.value)} />
              </label>
            </div>
          </fieldset>

          {error && <div className="auth-error" role="alert">{error}</div>}

          <button type="submit" className="btn btn--primary btn--full" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-alt">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
