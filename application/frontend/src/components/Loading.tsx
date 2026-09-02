export default function Loading() {
  return (
    <div className="loading" role="status" aria-label="Loading products">
      <div className="loading__spinner" />
      <p>Loading products...</p>
    </div>
  )
}
