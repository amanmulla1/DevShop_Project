import { useEffect, useMemo, useState } from 'react'
import { deleteAdminProduct, fetchAdminProducts, createAdminProduct, updateAdminProduct } from '../api/adminApi'
import { Product } from '../types/Product'

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [form, setForm] = useState({ id: 0, name: '', description: '', price: '', stock: '', category: 'Cloud' })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const KNOWN_CATEGORIES = ['Cloud', 'DevOps', 'Kubernetes', 'Monitoring', 'Containers', 'Infrastructure']

  useEffect(() => {
    loadProducts()
  }, [])

  async function loadProducts() {
    try {
      const data = await fetchAdminProducts()
      setProducts(data)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load products')
    } finally {
      setLoading(false)
    }
  }

  const categories = useMemo(() => ['All', ...new Set(products.map((p) => p.category || 'General'))], [products])

  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = category === 'All' || (product.category || 'General') === category
    return matchesSearch && matchesCategory
  })

  function resetForm() {
    setForm({ id: 0, name: '', description: '', price: '', stock: '', category: 'Cloud' })
    setEditingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const payload = {
        name: form.name,
        description: form.description,
        category: form.category || 'General',
        price: Number(form.price),
        stock: Number(form.stock),
      }

      if (editingId !== null) {
        await updateAdminProduct(editingId, payload)
      } else {
        await createAdminProduct(payload)
      }
      resetForm()
      await loadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save product')
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Delete product?')) return
    try {
      await deleteAdminProduct(id)
      await loadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete product')
    }
  }

  function startEdit(product: Product) {
    setEditingId(product.id)
    setForm({
      id: product.id,
      name: product.name,
      description: product.description ?? '',
      price: String(product.price),
      stock: String(product.stock),
      category: product.category || 'General',
    })
  }

  return (
    <>
        <header className="admin-header">
          <div>
            <p className="eyebrow">Catalog</p>
            <h1 className="admin-title">Product Management</h1>
          </div>
        </header>

        <div className="admin-toolbar">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        <div className="admin-form-card">
          <h2>{editingId ? 'Edit product' : 'Add product'}</h2>
          <form onSubmit={handleSubmit} className="admin-form">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Product name" required />
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" />
            <div className="form-inline">
              <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Price" required />
              <input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="Stock" required />
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required>
                {KNOWN_CATEGORIES.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn--primary">{editingId ? 'Save changes' : 'Add product'}</button>
              {editingId && <button type="button" className="btn btn--ghost" onClick={resetForm}>Cancel</button>}
            </div>
          </form>
          {error && <div className="checkout-error">{error}</div>}
        </div>

        <div className="admin-table-panel panel">
          {loading ? <div className="admin-empty">Loading products…</div> : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.category || 'General'}</td>
                    <td>${Number(product.price).toFixed(2)}</td>
                    <td>{product.stock}</td>
                    <td>
                      <div className="action-row">
                        <button className="btn btn--ghost btn--sm" onClick={() => startEdit(product)}>Edit</button>
                        <button className="btn btn--sm btn--danger" onClick={() => handleDelete(product.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
    </>
  )
}
