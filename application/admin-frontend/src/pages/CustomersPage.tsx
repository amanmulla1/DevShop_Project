import { useEffect, useMemo, useState } from 'react'
import { createAdminCustomer, deleteAdminCustomer, fetchAdminCustomers, updateAdminCustomer } from '../api/adminApi'
import { Customer } from '../types/Customer'

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', city: '', state: '', postalCode: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCustomers()
  }, [])

  async function loadCustomers() {
    try {
      const data = await fetchAdminCustomers()
      setCustomers(data)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load customers')
    } finally {
      setLoading(false)
    }
  }

  const filteredCustomers = useMemo(() => customers.filter((customer) => {
    const query = search.toLowerCase()
    return (
      customer.name?.toLowerCase().includes(query) ||
      customer.userid?.toLowerCase().includes(query) ||
      customer.email?.toLowerCase().includes(query)
    )
  }), [customers, search])

  function resetForm() {
    setForm({ name: '', email: '', phone: '', address: '', city: '', state: '', postalCode: '', password: '' })
    setEditingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const payload = { ...form }
      if (editingId !== null) {
        await updateAdminCustomer(editingId, payload)
      } else {
        await createAdminCustomer(payload)
      }
      resetForm()
      await loadCustomers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save customer')
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Delete customer?')) return
    try {
      await deleteAdminCustomer(id)
      await loadCustomers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete customer')
    }
  }

  function startEdit(customer: Customer) {
    setEditingId(customer.id ?? null)
    setForm({
      name: customer.name ?? '',
      email: customer.email ?? '',
      phone: customer.phone ?? '',
      address: customer.address ?? '',
      city: customer.city ?? '',
      state: customer.state ?? '',
      postalCode: customer.postalCode ?? '',
      password: customer.password ?? '',
    })
  }

  return (
    <>
        <div className="admin-toolbar">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search userid, name or email" />
        </div>

        <div className="admin-form-card">
          <h2>{editingId ? 'Edit customer' : 'Add customer'}</h2>
          <form onSubmit={handleSubmit} className="admin-form">
            <div className="form-inline">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" required />
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" required />
            </div>
            <div className="form-inline">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" />
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" />
            </div>
            <div className="form-inline">
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City" />
              <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="State" />
              <input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} placeholder="Postal code" />
            </div>
            <div className="form-inline">
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Password"
                />
                <button
                  type="button"
                  className="password-field__toggle"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn--primary">{editingId ? 'Save changes' : 'Add customer'}</button>
              {editingId && <button type="button" className="btn btn--ghost" onClick={resetForm}>Cancel</button>}
            </div>
          </form>
          {error && <div className="checkout-error">{error}</div>}
        </div>

        <div className="admin-table-panel panel">
          <table>
            <thead>
              <tr>
                <th>User ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Address</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="admin-empty">Loading customers…</td></tr>
              ) : filteredCustomers.length === 0 ? (
                <tr><td colSpan={6} className="admin-empty">No customers found.</td></tr>
              ) : (
                filteredCustomers.map((customer) => (
                <tr key={customer.id ?? customer.userid}>
                  <td>{customer.userid ?? 'Pending'}</td>
                  <td>{customer.name}</td>
                  <td>{customer.email}</td>
                  <td>{customer.phone ?? '—'}</td>
                  <td>{customer.address ?? '—'}</td>
                  <td>
                    <div className="action-row">
                      <button className="btn btn--ghost btn--sm" onClick={() => startEdit(customer)}>Edit</button>
                      <button className="btn btn--sm btn--danger" onClick={() => handleDelete(customer.id ?? 0)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>
      </>
  )
}
