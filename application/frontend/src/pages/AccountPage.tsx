import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CustomerProfile, fetchMe } from '../api/authApi'

export default function AccountPage() {
  const { user, authenticated, token } = useAuth()
  const [profile, setProfile] = useState<CustomerProfile | null>(null)

  useEffect(() => {
    let mounted = true
    async function loadProfile() {
      if (!token) return
      try {
        const data = await fetchMe(token)
        if (mounted) setProfile(data)
      } catch {
        // Fall back to the auth context fields if the profile fetch fails.
      }
    }
    loadProfile()
    return () => {
      mounted = false
    }
  }, [token])

  if (!authenticated || !user) {
    return <Navigate to="/login" replace />
  }

  const display: CustomerProfile = { ...user, ...(profile ?? {}) }

  return (
    <div className="account-layout">
      <h1>My Account</h1>
      <p className="auth-subtitle">Your DevShop details and order history.</p>

      <div className="account-card">
        <h2>Profile</h2>
        <div className="account-grid">
          <div className="account-field">
            <div className="account-field__label">Customer ID</div>
            <div className="account-field__value">{display.userid || '—'}</div>
          </div>
          <div className="account-field">
            <div className="account-field__label">Name</div>
            <div className="account-field__value">{display.name}</div>
          </div>
          <div className="account-field">
            <div className="account-field__label">Email</div>
            <div className="account-field__value">{display.email}</div>
          </div>
          <div className="account-field">
            <div className="account-field__label">Phone</div>
            <div className="account-field__value">{display.phone || '—'}</div>
          </div>
          <div className="account-field">
            <div className="account-field__label">Delivery Address</div>
            <div className="account-field__value">
              {[
                display.address,
                display.city,
                display.state,
                display.postalCode,
              ].filter(Boolean).join(', ') || '—'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <Link to="/orders" className="btn btn--primary">View order history</Link>
      </div>
    </div>
  )
}
