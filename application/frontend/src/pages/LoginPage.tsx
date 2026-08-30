import { FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
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
    <div className="auth-layout">
      {/* Branding panel */}
      <aside className="auth-brand">
        <div className="auth-brand__glow auth-brand__glow--1" aria-hidden="true" />
        <div className="auth-brand__glow auth-brand__glow--2" aria-hidden="true" />

        <div className="auth-brand__top">
          <div className="auth-brand__logo" aria-hidden="true">
            <img src="/logo.png" alt="" className="auth-brand__logo-icon" />
          </div>
          <div className="auth-brand__wordmark">
            <span className="auth-brand__wordmark-title">DevShop</span>
            <span className="auth-brand__wordmark-sub">Store</span>
          </div>
        </div>

        <div className="auth-brand__body">
          <h2 className="auth-brand__headline">
            Everything your project needs, delivered fast.
          </h2>
          <p className="auth-brand__subline">
            Browse production-grade infrastructure tools and observability
            platforms — check out securely and track every order.
          </p>

          <ul className="auth-brand__features">
            <li>
              <span className="auth-brand__tick" aria-hidden="true">✓</span>
              Secure checkout
            </li>
            <li>
              <span className="auth-brand__tick" aria-hidden="true">✓</span>
              Order tracking
            </li>
            <li>
              <span className="auth-brand__tick" aria-hidden="true">✓</span>
              Save your details
            </li>
          </ul>
        </div>

        <div className="auth-brand__foot">
          <span className="auth-brand__foot-mark" aria-hidden="true">◈</span>
          DevShop &middot; Your friendly storefront
        </div>
      </aside>

      {/* Form panel */}
      <main className="auth-form-wrap">
        <div className="auth-card auth-card--page">
          <div className="auth-card__mobile-logo">
            <div className="auth-brand__logo" aria-hidden="true">
              <img src="/logo.png" alt="" className="auth-brand__logo-icon" />
            </div>
            <div className="auth-brand__wordmark">
              <span className="auth-brand__wordmark-title">DevShop</span>
              <span className="auth-brand__wordmark-sub">Store</span>
            </div>
          </div>

          <p className="auth-card__eyebrow">DevShop</p>
          <h1 className="auth-card__title">Sign in</h1>
          <p className="auth-subtitle">Welcome back — pick up where you left off.</p>

          <form onSubmit={handleSubmit} className="auth-form">
            <label className="auth-form__field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
            <label className="auth-form__field">
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

            {error && <div className="auth-error" role="alert">{error}</div>}

            <button type="submit" className="btn btn--primary btn--full auth-form__submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="auth-alt">
            New to DevShop? <Link to="/register">Create an account</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
