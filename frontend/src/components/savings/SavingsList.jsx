import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate, fmtMoney } from '../../lib/format.js'

// SBCA_List.aspx rebuilt — the Savings Deposit List, with the same columns the
// old grid had: Account No, Customer Name, Customer Id, Open Date, Last Tran
// Dt, Status and the closing balance.
const PER_PAGE = 25

export default function SavingsList({ navigate }) {
  const [term, setTerm] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ accounts: [], total: 0, page: 1, limit: PER_PAGE })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams({ q, status, page: String(page), limit: String(PER_PAGE) })
      setData(await api.get(`/savings?${qs}`))
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
              placeholder="Account no, customer name or id…"
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
          <button type="button" className="btn primary" onClick={() => navigate('sb-new')}>
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
                <th style={{ width: 110 }}>Customer Id</th>
                <th style={{ width: 110 }}>Open Date</th>
                <th style={{ width: 120 }}>Last Tran Dt</th>
                <th style={{ width: 90 }}>Status</th>
                <th style={{ width: 130 }} className="right-align">
                  Cl. Bal
                </th>
                <th style={{ width: 110 }} className="right-align">
                  Edit / View
                </th>
              </tr>
            </thead>
            <tbody>
              {!loading && data.accounts.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted" style={{ padding: 28, textAlign: 'center' }}>
                    No savings accounts found.
                  </td>
                </tr>
              )}
              {data.accounts.map((a) => (
                <tr key={a.id} className="row-link" onClick={() => navigate('sb-view', { id: a.id })}>
                  <td className="mono">{a.accNo}</td>
                  <td className="clamp">{a.customerName}</td>
                  <td className="mono">{a.custId}</td>
                  <td>{fmtDate(a.openDate)}</td>
                  <td>{a.lastTranDate ? fmtDate(a.lastTranDate) : '—'}</td>
                  <td>
                    <span className={`badge ${a.status === 'A' ? 'ok' : 'neutral'}`}>
                      {a.status === 'A' ? 'Active' : 'Closed'}
                    </span>
                  </td>
                  <td className="right-align">{fmtMoney(a.balance)}</td>
                  <td className="right-align" onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <button className="icon-btn" title="View" onClick={() => navigate('sb-view', { id: a.id })}>
                        👁
                      </button>
                      {a.status === 'A' ? (
                        <button
                          className="icon-btn"
                          title="Transaction"
                          onClick={() => navigate('sb-tran', { accNo: a.accNo })}
                        >
                          ₹
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
