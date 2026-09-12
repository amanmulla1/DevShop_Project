interface Props {
  onBrowse: () => void
  onViewCategories: () => void
  totalProducts: number
}

export default function Hero({ onBrowse, onViewCategories, totalProducts }: Props) {
  return (
    <section className="hero">
      <div className="hero__inner">
        {/* Left: copy */}
        <div className="hero__content">
          <span className="hero__eyebrow">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="5" r="5"/>
            </svg>
            Cloud &amp; DevOps Marketplace
          </span>

          <h1 className="hero__title">
            Build.{' '}
            <span className="hero__title-accent">Deploy.</span>
            {' '}Scale.
          </h1>

          <p className="hero__subtitle">
            Production-grade infrastructure tools, Kubernetes solutions, and
            observability platforms — everything your team needs to ship with confidence.
          </p>

          <div className="hero__ctas">
            <button className="btn btn--primary" onClick={onBrowse} style={{ padding: '.7rem 1.5rem' }}>
              Browse Products
            </button>
            <button className="btn btn--ghost" onClick={onViewCategories} style={{ padding: '.7rem 1.5rem' }}>
              View Categories
            </button>
          </div>

          <div className="hero__stats">
            <div>
              <p className="hero__stat-value">{totalProducts}</p>
              <p className="hero__stat-label">Products</p>
            </div>
            <div>
              <p className="hero__stat-value">6</p>
              <p className="hero__stat-label">Categories</p>
            </div>
            <div>
              <p className="hero__stat-value">100%</p>
              <p className="hero__stat-label">Cloud-Native</p>
            </div>
          </div>
        </div>

        {/* Right: Infrastructure topology SVG */}
        <div className="hero__graphic" aria-hidden="true">
          <svg viewBox="0 0 440 380" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <radialGradient id="glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3"/>
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0"/>
              </radialGradient>
              <filter id="blur-sm">
                <feGaussianBlur stdDeviation="2"/>
              </filter>
            </defs>

            {/* Background glow */}
            <ellipse cx="220" cy="190" rx="200" ry="160" fill="url(#glow)"/>

            {/* Connection lines */}
            <g stroke="#6366f1" strokeWidth="1" strokeDasharray="4 4" opacity="0.4">
              {/* Hub to nodes */}
              <line x1="220" y1="190" x2="100" y2="100"/>
              <line x1="220" y1="190" x2="340" y2="100"/>
              <line x1="220" y1="190" x2="80"  y2="260"/>
              <line x1="220" y1="190" x2="360" y2="260"/>
              <line x1="220" y1="190" x2="220" y2="320"/>
              {/* Node to node */}
              <line x1="100" y1="100" x2="340" y2="100" opacity="0.2"/>
              <line x1="80"  y1="260" x2="360" y2="260" opacity="0.2"/>
            </g>

            {/* Animated pulse rings on hub */}
            <circle cx="220" cy="190" r="55" fill="none" stroke="#6366f1" strokeWidth="1" opacity="0.15">
              <animate attributeName="r" values="45;75;45" dur="3s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.2;0;0.2" dur="3s" repeatCount="indefinite"/>
            </circle>

            {/* Central hub — Kubernetes */}
            <circle cx="220" cy="190" r="42" fill="#1a2235" stroke="#6366f1" strokeWidth="1.5"/>
            <text x="220" y="183" textAnchor="middle" fontSize="22" fill="white">☸️</text>
            <text x="220" y="204" textAnchor="middle" fontSize="9" fill="#818cf8" fontFamily="monospace" fontWeight="600">KUBERNETES</text>

            {/* Node: Cloud */}
            <circle cx="100" cy="100" r="32" fill="#1a2235" stroke="#22d3ee" strokeWidth="1.5"/>
            <text x="100" y="93" textAnchor="middle" fontSize="17" fill="white">☁️</text>
            <text x="100" y="111" textAnchor="middle" fontSize="8" fill="#67e8f9" fontFamily="monospace" fontWeight="600">CLOUD</text>

            {/* Node: CI/CD */}
            <circle cx="340" cy="100" r="32" fill="#1a2235" stroke="#10b981" strokeWidth="1.5"/>
            <text x="340" y="93" textAnchor="middle" fontSize="17" fill="white">⚙️</text>
            <text x="340" y="111" textAnchor="middle" fontSize="8" fill="#6ee7b7" fontFamily="monospace" fontWeight="600">CI/CD</text>

            {/* Node: Monitoring */}
            <circle cx="80" cy="260" r="30" fill="#1a2235" stroke="#f59e0b" strokeWidth="1.5"/>
            <text x="80" y="253" textAnchor="middle" fontSize="16" fill="white">📊</text>
            <text x="80" y="271" textAnchor="middle" fontSize="7.5" fill="#fcd34d" fontFamily="monospace" fontWeight="600">MONITOR</text>

            {/* Node: Containers */}
            <circle cx="360" cy="260" r="30" fill="#1a2235" stroke="#8b5cf6" strokeWidth="1.5"/>
            <text x="360" y="253" textAnchor="middle" fontSize="16" fill="white">🐳</text>
            <text x="360" y="271" textAnchor="middle" fontSize="7.5" fill="#c4b5fd" fontFamily="monospace" fontWeight="600">DOCKER</text>

            {/* Node: Infrastructure */}
            <circle cx="220" cy="320" r="28" fill="#1a2235" stroke="#ec4899" strokeWidth="1.5"/>
            <text x="220" y="313" textAnchor="middle" fontSize="15" fill="white">🏗️</text>
            <text x="220" y="332" textAnchor="middle" fontSize="7" fill="#f9a8d4" fontFamily="monospace" fontWeight="600">INFRA</text>

            {/* Small data-flow dots animated along lines */}
            <circle r="3" fill="#22d3ee" opacity="0.8">
              <animateMotion dur="2.5s" repeatCount="indefinite" path="M220,190 L100,100"/>
              <animate attributeName="opacity" values="0;1;0" dur="2.5s" repeatCount="indefinite"/>
            </circle>
            <circle r="3" fill="#10b981" opacity="0.8">
              <animateMotion dur="3s" repeatCount="indefinite" path="M220,190 L340,100"/>
              <animate attributeName="opacity" values="0;1;0" dur="3s" repeatCount="indefinite"/>
            </circle>
            <circle r="3" fill="#f59e0b" opacity="0.8">
              <animateMotion dur="2s" repeatCount="indefinite" path="M220,190 L80,260"/>
              <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite"/>
            </circle>
            <circle r="3" fill="#8b5cf6" opacity="0.8">
              <animateMotion dur="2.8s" repeatCount="indefinite" path="M220,190 L360,260"/>
              <animate attributeName="opacity" values="0;1;0" dur="2.8s" repeatCount="indefinite"/>
            </circle>
          </svg>
        </div>
      </div>
    </section>
  )
}
