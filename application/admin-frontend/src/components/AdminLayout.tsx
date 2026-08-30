import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { label: 'Dashboard', href: '/', match: ['/'] },
  { label: 'Products', href: '/products', match: ['/products'] },
  { label: 'Customers', href: '/customers', match: ['/customers'] },
  { label: 'Orders', href: '/orders', match: ['/orders'] },
]

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isDashboard = location.pathname === '/'

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function isActive(href: string) {
    return window.location.pathname === href
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <img src={isDashboard ? '/home-logo.png' : '/logo.png'} alt="DevShop logo" className="admin-brand-mark admin-brand-mark--img" />
          <div>
            <div className="admin-brand-title">DevShop</div>
            <div className="admin-brand-subtitle">Admin</div>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Admin menu">
          {navItems.map((item) => (
            <Link
              key={item.label}
              to={item.href}
              className={`admin-nav__item ${isActive(item.href) ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <div>
            <p className="eyebrow">Administrator</p>
            <h1 className="admin-title">DevShop Dashboard</h1>
          </div>
          <div className="admin-header__actions">
            <span className="admin-user">
              <span className="admin-user__avatar">{(user?.name || 'A').charAt(0).toUpperCase()}</span>
              <span className="admin-user__name">{user?.name || 'Admin'}</span>
            </span>
            <button className="admin-header__button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        <Outlet />
      </div>
    </div>
  )
}
