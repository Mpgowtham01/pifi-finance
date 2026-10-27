import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate, fmtMoney } from '../../lib/format.js'

// Share_List.aspx rebuilt — the Share Master List: one keyword box, Add New,
// the record count, and the same columns the old grid had.
const PER_PAGE = 25

export default function ShareList({ navigate }) {
  const [term, setTerm] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ shares: [], total: 0, page: 1, limit: PER_PAGE })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams({ q, status, page: String(page), limit: String(PER_PAGE) })
      setData(await api.get(`/shares?${qs}`))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [q, status, page])

  useEffect(() => {
    load()
  }, [load])

  const pages = Math.max(1, Math.ceil(data.total / data.limit))

  return (
    <div>
      <div className="filter-bar">
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setQ(term.trim())
          }}
        >
          <div className="search">
            <input
              placeholder="Account no, customer, id or certificate no…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
            aria-label="Status"
          >
            <option value="">All status</option>
            <option value="A">A — Active</option>
            <option value="C">C — Closed</option>
          </select>
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
          <button type="button" className="btn primary" onClick={() => navigate('share-new')}>
            + Add New
          </button>
        </form>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="card">
        <div className="card-head">
          <strong>{loading ? 'Loading…' : `${data.total} record${data.total === 1 ? '' : 's'} found`}</strong>
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Account No</th>
                <th style={{ width: '28%', minWidth: 200 }}>Customer Name</th>
                <th style={{ width: 110 }}>Date</th>
                <th style={{ width: 80 }} className="right-align">
                  Shares
                </th>
                <th style={{ width: 110 }} className="right-align">
                  Share Amt
                </th>
                <th style={{ width: 90 }} className="right-align">
                  From No.
                </th>
                <th style={{ width: 90 }} className="right-align">
                  To No.
                </th>
                <th style={{ width: 120 }}>Certificate No</th>
                <th style={{ width: 90 }}>Status</th>
                <th style={{ width: 110 }} className="right-align">
                  Edit / View
                </th>
              </tr>
            </thead>
            <tbody>
              {!loading && data.shares.length === 0 && (
                <tr>
                  <td colSpan={10} className="muted" style={{ padding: 28, textAlign: 'center' }}>
                    No share accounts found.
                  </td>
                </tr>
              )}
              {data.shares.map((s) => (
                <tr key={s.id} className="row-link" onClick={() => navigate('share-view', { id: s.id })}>
                  <td className="mono">{s.accNo}</td>
                  <td className="clamp">{s.customerName}</td>
                  <td>{fmtDate(s.date)}</td>
                  <td className="right-align">{s.noOfShares}</td>
                  <td className="right-align">{fmtMoney(s.shareAmount)}</td>
                  <td className="right-align mono">{s.shareNoFrom || '—'}</td>
                  <td className="right-align mono">{s.shareNoTo || '—'}</td>
                  <td className="mono">{s.certificateNo || '—'}</td>
                  <td>
                    <span className={`badge ${s.status === 'A' ? 'ok' : 'neutral'}`}>
                      {s.status === 'A' ? 'Active' : 'Closed'}
                    </span>
                  </td>
                  <td className="right-align" onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <button className="icon-btn" title="View" onClick={() => navigate('share-view', { id: s.id })}>
                        👁
                      </button>
                      {s.status === 'A' ? (
                        <button
                          className="icon-btn"
                          title="Certificate"
                          onClick={() => navigate('share-certificate', { accNo: s.accNo })}
                        >
                          🧾
                        </button>
                      ) : (
                        <span className="icon-slot" aria-hidden="true" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pager">
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
    </div>
  )
}
