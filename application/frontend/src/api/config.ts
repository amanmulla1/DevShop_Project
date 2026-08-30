const BACKEND_PORT = 8080

export function getBaseUrl(): string {
  const override = import.meta.env.VITE_API_BASE_URL
  if (override) {
    return override
  }
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  return `http://${host}:${BACKEND_PORT}`
}
