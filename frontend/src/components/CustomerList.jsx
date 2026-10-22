import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { initials } from '../lib/format.js'

// Customer_List.aspx rebuilt: one keyword box + Go, an "Add New" button, the
// record count, and the same columns — Cust. Id, Name, Address, City, Pincode,
// Edit/View, Delete.
const PER_PAGE = 25

export default function CustomerList({ navigate }) {
  const [term, setTerm] = useState('') // what is typed
  const [q, setQ] = useState('') // what is searched
  const [data, setData] = useState({ customers: [], total: 0, page: 1, limit: PER_PAGE })
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirmDel, setConfirmDel] = useState(null)
  const [delBusy, setDelBusy] = useState(false)
  const [flash, setFlash] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await api.get(`/customers?q=${encodeURIComponent(q)}&page=${page}&limit=${PER_PAGE}`))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [q, page])

  useEffect(() => {
    load()
  }, [load])

  function search(e) {
    e?.preventDefault()
    setPage(1)
    setQ(term.trim())
  }

  async function doDelete() {
    setDelBusy(true)
    setError('')
    try {
      await api.del(`/customers/${confirmDel.id}`)
      setFlash(`Customer ${confirmDel.custId} deleted.`)
      setConfirmDel(null)
      load()
    } catch (e) {
      setError(e.message)
      setConfirmDel(null)
    } finally {
      setDelBusy(false)
    }
  }

  const pages = Math.max(1, Math.ceil(data.total / data.limit))
  const from = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1
  const to = Math.min(data.page * data.limit, data.total)

  return (
    <div>
      <form className="toolbar" onSubmit={search}>
        <div className="search">
          <input
            placeholder="Search by id, name, address, city, pincode or mobile…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <button className="btn" type="submit">
          Go
        </button>
        {q && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setTerm('')
              setQ('')
              setPage(1)
            }}
          >
            Clear
          </button>
        )}
        <button type="button" className="btn primary" onClick={() => navigate('customer-new')}>
          + Add New
        </button>
      </form>

      {error && <div className="notice error">{error}</div>}
      {flash && <div className="notice success">{flash}</div>}

      <div className="card">
        <div className="card-head">
          <strong>
            {loading ? 'Loading…' : `${data.total} record${data.total === 1 ? '' : 's'} found`}
          </strong>
          {q && <span className="muted">for “{q}”</span>}
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Cust. Id</th>
                <th>Name</th>
                <th>Address</th>
                <th style={{ width: 140 }}>City</th>
                <th style={{ width: 90 }}>Pincode</th>
                <th style={{ width: 150 }} className="right-align">
                  Edit / View
                </th>
              </tr>
            </thead>
            <tbody>
              {!loading && data.customers.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted" style={{ padding: 28, textAlign: 'center' }}>
                    No customers found.
                  </td>
                </tr>
              )}
              {data.customers.map((c) => (
                <tr key={c.id} className="row-link" onClick={() => navigate('customer-enquiry', { id: c.id })}>
                  <td className="mono">{c.custId}</td>
                  <td>
                    <div className="cell-name">
                      <span className="recent-avatar sm">
                        {c.hasPhoto ? (
                          <img src={`/api/customers/${c.id}/photo`} alt="" loading="lazy" />
                        ) : (
                          initials(c.name)
                        )}
                      </span>
                      <span>
                        {c.name}
                        {!c.active && <span className="badge off" style={{ marginLeft: 8 }}>In-active</span>}
                      </span>
                    </div>
                  </td>
                  <td className="clamp">{c.address || '—'}</td>
                  <td>{c.city || '—'}</td>
                  <td>{c.pincode || '—'}</td>
                  <td className="right-align" onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title="Enquiry"
                        onClick={() => navigate('customer-enquiry', { id: c.id })}
                      >
                        👁
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title="Edit"
                        onClick={() => navigate('customer-edit', { id: c.id })}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Delete"
                        onClick={() => setConfirmDel(c)}
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pager">
        <span className="muted">
          {from}–{to} of {data.total}
        </span>
        <button className="btn" disabled={page <= 1} onClick={() => setPage(1)}>
          «
        </button>
        <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          ‹ Prev
        </button>
        <span className="muted">
          Page {data.page} of {pages}
        </span>
        <button className="btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
          Next ›
        </button>
        <button className="btn" disabled={page >= pages} onClick={() => setPage(pages)}>
          »
        </button>
      </div>

      {confirmDel && (
        <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setConfirmDel(null)}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-head">Delete customer</div>
            <div className="modal-body">
              <p style={{ marginTop: 0 }}>
                Delete <strong>{confirmDel.name}</strong> ({confirmDel.custId})? This cannot be undone.
              </p>
              <p className="muted" style={{ marginBottom: 0 }}>
                A customer holding accounts cannot be deleted — mark them in-active instead.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setConfirmDel(null)} disabled={delBusy}>
                Cancel
              </button>
              <button className="btn danger" onClick={doDelete} disabled={delBusy}>
                {delBusy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
