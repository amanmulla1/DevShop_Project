import { FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login, authenticated } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (authenticated) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="admin-auth">
      {/* Branding panel */}
      <aside className="admin-auth__brand">
        <div className="admin-auth__glow admin-auth__glow--1" aria-hidden="true" />
        <div className="admin-auth__glow admin-auth__glow--2" aria-hidden="true" />

        <div className="admin-auth__brand-top">
          <div className="admin-auth__logo" aria-hidden="true">
            <img src="/logo.png" alt="" className="admin-auth__logo-icon" />
          </div>
          <div className="admin-auth__wordmark">
            <span className="admin-auth__wordmark-title">DevShop</span>
            <span className="admin-auth__wordmark-sub">Admin Console</span>
          </div>
        </div>

        <div className="admin-auth__brand-body">
          <h2 className="admin-auth__headline">
            Run your storefront from one clean command center.
          </h2>
          <p className="admin-auth__subline">
            Manage products, customers and orders — all from a single, secure
            dashboard built for your team.
          </p>

          <ul className="admin-auth__features">
            <li>
              <span className="admin-auth__tick" aria-hidden="true">✓</span>
              Products &amp; inventory
            </li>
            <li>
              <span className="admin-auth__tick" aria-hidden="true">✓</span>
              Customers &amp; profiles
            </li>
            <li>
              <span className="admin-auth__tick" aria-hidden="true">✓</span>
              Orders &amp; fulfillment
            </li>
          </ul>
        </div>

        <div className="admin-auth__brand-foot">
          <span className="admin-auth__brand-foot-mark" aria-hidden="true">◈</span>
          DevShop Admin &middot; Secure access
        </div>
      </aside>

      {/* Form panel */}
      <main className="admin-auth__form-wrap">
        <div className="admin-auth__card">
          <div className="admin-auth__mobile-logo">
            <div className="admin-auth__logo" aria-hidden="true">
              <img src="/logo.png" alt="" className="admin-auth__logo-icon" />
            </div>
            <div className="admin-auth__wordmark">
              <span className="admin-auth__wordmark-title">DevShop</span>
              <span className="admin-auth__wordmark-sub">Admin Console</span>
            </div>
          </div>

          <p className="admin-auth__eyebrow">DevShop Admin</p>
          <h1 className="admin-auth__title">Welcome back</h1>
          <p className="admin-auth__hint">Sign in to manage your store.</p>

          <form onSubmit={handleSubmit} className="admin-auth__form">
            <label className="admin-auth__field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="admin@ds.com"
              />
            </label>
            <label className="admin-auth__field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </label>

            {error && (
              <div className="admin-auth__error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" className="btn btn--primary admin-auth__submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="admin-auth__alt">
            <a href="http://localhost:5173" target="_blank" rel="noopener noreferrer">
              ← Back to storefront
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}
