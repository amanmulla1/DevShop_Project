import { useLocation } from 'react-router-dom'

const year = new Date().getFullYear()

export default function Footer() {
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <footer className="footer">
      <div className="footer__inner">
        {/* Brand column */}
        <div>
          <div className="footer__brand-name">
            <img src={isHome ? '/home-logo.png' : '/logo.png'} alt="DevShop logo" className="footer__brand-logo" />
            DevShop
          </div>
          <p className="footer__brand-desc">
            A cloud-native DevOps marketplace demonstrating end-to-end
            infrastructure provisioning, CI/CD, containerisation, and observability.
          </p>
        </div>

        {/* Products column */}
        <div>
          <p className="footer__col-title">Products</p>
          <div className="footer__links">
            <a href="#categories" className="footer__link">Cloud Servers</a>
            <a href="#categories" className="footer__link">DevOps Toolkits</a>
            <a href="#categories" className="footer__link">Kubernetes Bundles</a>
            <a href="#categories" className="footer__link">Monitoring Stacks</a>
          </div>
        </div>

        {/* Categories column */}
        <div>
          <p className="footer__col-title">Categories</p>
          <div className="footer__links">
            <a href="#categories" className="footer__link">Cloud</a>
            <a href="#categories" className="footer__link">DevOps</a>
            <a href="#categories" className="footer__link">Kubernetes</a>
            <a href="#categories" className="footer__link">Monitoring</a>
            <a href="#categories" className="footer__link">Containers</a>
            <a href="#categories" className="footer__link">Infrastructure</a>
          </div>
        </div>

        {/* Company column */}
        <div>
          <p className="footer__col-title">Project</p>
          <div className="footer__links">
            <a href="#about" className="footer__link">About</a>
          </div>
        </div>
      </div>

      <div className="footer__bottom">
        <span>© {year} DevShop. Cloud-Native DevOps Portfolio Project.</span>
        <span>Spring Boot · React · Docker · Kubernetes · Prometheus</span>
      </div>
    </footer>
  )
}
