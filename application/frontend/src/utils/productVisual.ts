/**
 * Maps a product name/description to a visual category for card styling.
 * Keeps cards visually distinct without requiring real product images.
 */
export interface ProductVisual {
  icon: string
  gradientClass: string
  category: string
}

export const PRODUCT_CATEGORIES = [
  'Cloud',
  'DevOps',
  'Kubernetes',
  'Monitoring',
  'Containers',
  'Infrastructure',
] as const

export const CATEGORY_META: Record<string, Omit<ProductVisual, 'category'>> = {
  Cloud: { icon: '☁️', gradientClass: 'product-card__visual--cloud' },
  DevOps: { icon: '⚙️', gradientClass: 'product-card__visual--devops' },
  Kubernetes: { icon: '☸️', gradientClass: 'product-card__visual--kubernetes' },
  Monitoring: { icon: '📊', gradientClass: 'product-card__visual--monitoring' },
  Containers: { icon: '🐳', gradientClass: 'product-card__visual--containers' },
  Infrastructure: { icon: '🏗️', gradientClass: 'product-card__visual--infrastructure' },
}

const EXACT_PRODUCT_CATEGORY_MAP: Record<string, string> = {
  'Cloud Server T2': 'Cloud',
  'AWS Cloud Server Pro': 'Cloud',
  'Cloud Storage Vault': 'Cloud',
  'DevOps Toolkit Pro': 'DevOps',
  'CI/CD Pipeline Pro': 'DevOps',
  'Terraform Infrastructure Pack': 'DevOps',
  'Kubernetes Cluster Pack': 'Kubernetes',
  'Kubernetes Production Cluster': 'Kubernetes',
  'Kubernetes Helm Bundle': 'Kubernetes',
  'Monitoring Dashboard': 'Monitoring',
  'Prometheus Monitoring Pro': 'Monitoring',
  'Grafana Observability Suite': 'Monitoring',
  'Docker Deployment Kit': 'Containers',
  'Container Registry Pro': 'Containers',
  'Ansible Automation Pack': 'Infrastructure',
  'Linux Server Management': 'Infrastructure',
}

const RULES: Array<{ keywords: string[]; category: string }> = [
  { keywords: ['kubernetes', 'k8s', 'cluster', 'pod', 'helm'], category: 'Kubernetes' },
  { keywords: ['prometheus', 'grafana', 'monitoring', 'dashboard', 'observability', 'alert'], category: 'Monitoring' },
  { keywords: ['docker', 'container', 'registry', 'compose', 'image'], category: 'Containers' },
  { keywords: ['ci/cd', 'cicd', 'pipeline', 'jenkins', 'toolkit', 'automation', 'devops'], category: 'DevOps' },
  { keywords: ['terraform', 'ansible', 'infrastructure', 'iac', 'provision', 'linux server', 'server management'], category: 'Infrastructure' },
  { keywords: ['cloud', 'server', 'aws', 'ec2', 'compute', 'storage', 's3'], category: 'Cloud' },
]

const DEFAULT_VISUAL: ProductVisual = {
  icon: '📦',
  gradientClass: 'product-card__visual--default',
  category: 'Tools',
}

export function getProductCategory(name: string, description?: string | null): string {
  const productName = name?.trim() ?? ''
  const exactMatch = EXACT_PRODUCT_CATEGORY_MAP[productName]
  if (exactMatch) {
    return exactMatch
  }

  const haystack = `${productName} ${description ?? ''}`.toLowerCase()
  for (const rule of RULES) {
    if (rule.keywords.some(kw => haystack.includes(kw))) {
      return rule.category
    }
  }

  return 'Infrastructure'
}

export function getProductVisual(name: string, description?: string | null): ProductVisual {
  const category = getProductCategory(name, description)
  const meta = CATEGORY_META[category] ?? { icon: DEFAULT_VISUAL.icon, gradientClass: DEFAULT_VISUAL.gradientClass }

  return {
    ...meta,
    category,
  }
}
