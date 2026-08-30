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
          <div className="footer__social">
            <a href="#" className="footer__social-link" aria-label="GitHub">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
              </svg>
            </a>
            <a href="#" className="footer__social-link" aria-label="LinkedIn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z"/>
                <circle cx="4" cy="4" r="2"/>
              </svg>
            </a>
          </div>
        </div>

        {/* Products column */}
        <div>
          <p className="footer__col-title">Products</p>
          <div className="footer__links">
            <a href="#" className="footer__link">Cloud Servers</a>
            <a href="#" className="footer__link">DevOps Toolkits</a>
            <a href="#" className="footer__link">Kubernetes Bundles</a>
            <a href="#" className="footer__link">Monitoring Stacks</a>
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
            <a href="#" className="footer__link">Architecture</a>
            <a href="#" className="footer__link">API Docs</a>
            <a href="#" className="footer__link">GitHub</a>
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
