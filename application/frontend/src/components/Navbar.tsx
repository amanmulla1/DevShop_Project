import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

interface Props {
  cartCount: number
  onCartOpen: () => void
}

export default function Navbar({ cartCount, onCartOpen }: Props) {
  const { user, authenticated, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isHome = location.pathname === '/'
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleLogout() {
    logout()
    navigate('/')
  }

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <a href="/" className="navbar__brand">
        <img src={isHome ? '/home-logo.png' : '/logo.png'} alt="DevShop logo" className="navbar__brand-icon" />
        <span>DevShop</span>
      </a>

      <div className="navbar__links">
        <a href="#products" className="navbar__link navbar__link--active">Products</a>
        <a href="#categories" className="navbar__link">Categories</a>
        <a href="#about" className="navbar__link">About</a>
      </div>

      <div className="navbar__spacer" />

      <div className="navbar__actions">
        {authenticated && user ? (
          <div className="navbar__auth" ref={menuRef}>
            <button
              className="navbar__account-btn navbar__account-btn--menu"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Account menu"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21a8 8 0 0 0-16 0"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              {user.name}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="navbar__chevron" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {menuOpen && (
              <div className="navbar__menu" role="menu">
                <Link to="/account" role="menuitem" onClick={closeMenu}>
                  <span className="navbar__menu-label">My Account</span>
                  <span className="navbar__menu-desc">Profile details</span>
                </Link>
                <Link to="/orders" role="menuitem" onClick={closeMenu}>
                  <span className="navbar__menu-label">Order History</span>
                  <span className="navbar__menu-desc">View your orders</span>
                </Link>
                <button type="button" className="navbar__menu-logout" role="menuitem" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="navbar__auth">
            <Link to="/login" className="navbar__account-btn" aria-label="Sign in">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21a8 8 0 0 0-16 0"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              Sign in
            </Link>
          </div>
        )}
        <button
          className="navbar__cart-btn"
          onClick={onCartOpen}
          aria-label={`Open cart, ${cartCount} item${cartCount !== 1 ? 's' : ''}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          Cart
          {cartCount > 0 && (
            <span className="navbar__cart-badge">{cartCount}</span>
          )}
        </button>
      </div>
    </nav>
  )
}
