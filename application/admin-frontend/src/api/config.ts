const BACKEND_PORT = 8080
const RUNTIME_GLOBAL = '__DEVSHOP_API_BASE__'

export function getBaseUrl(): string {
  const buildOverride = import.meta.env.VITE_API_BASE_URL
  if (buildOverride) {
    return buildOverride
  }
  if (typeof window !== 'undefined') {
    const runtime = (window as unknown as Record<string, unknown>)[RUNTIME_GLOBAL]
    if (typeof runtime === 'string' && runtime.length > 0) {
      return runtime
    }
  }
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  return `http://${host}:${BACKEND_PORT}`
}
