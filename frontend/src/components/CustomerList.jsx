import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function CustomerList({ navigate }) {
  const [q, setQ] = useState('')
  const [data, setData] = useState({ customers: [], total: 0, page: 1, limit: 25 })
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = setTimeout(load, 250) // debounce search
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, page])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get(`/customers?q=${encodeURIComponent(q)}&page=${page}&limit=25`)
      setData(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const pages = Math.max(1, Math.ceil(data.total / data.limit))

  return (
    <div>
      <div className="toolbar">
        <div className="search">
          <input
            placeholder="Search by name, ID, mobile, city…"
            value={q}
            onChange={(e) => {
              setPage(1)
              setQ(e.target.value)
            }}
          />
        </div>
        <button className="btn primary" onClick={() => navigate('customer-new')}>
          + New customer
        </button>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="card">
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Cust ID</th>
                <th>Name</th>
                <th>Father / Guardian</th>
                <th>Mobile</th>
                <th>City</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {!loading && data.customers.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No customers found.
                  </td>
                </tr>
              )}
              {data.customers.map((c) => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate('customer-edit', { id: c.id })}>
                  <td>{c.custId}</td>
                  <td>{c.name}</td>
                  <td>{c.fatherOrGuardian || '—'}</td>
                  <td>{c.mobile || '—'}</td>
                  <td>{c.city || '—'}</td>
                  <td>
                    <span className={`badge ${c.active ? 'ok' : 'off'}`}>{c.active ? 'Active' : 'Inactive'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pager">
        <span className="muted">
          {data.total} customer{data.total === 1 ? '' : 's'} · page {data.page} of {pages}
        </span>
        <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          ‹ Prev
        </button>
        <button className="btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
          Next ›
        </button>
      </div>
    </div>
  )
}
