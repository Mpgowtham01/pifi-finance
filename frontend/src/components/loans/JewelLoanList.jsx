import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate, fmtMoney } from '../../lib/format.js'

// JL_List.aspx rebuilt. The old screen had a row of scheme radio buttons
// across the top, a "search by" dropdown with a keyword box, the record
// count, and the same eleven columns.
const PER_PAGE = 25

const SEARCH_FIELDS = [
  { value: 'name', label: 'Customer Name' },
  { value: 'accNo', label: 'Account No' },
  { value: 'oldAccNo', label: 'Old Account No' },
  { value: 'custId', label: 'Customer Id' },
]

export default function JewelLoanList({ navigate }) {
  const [schemes, setSchemes] = useState([])
  const [scheme, setScheme] = useState('')
  const [field, setField] = useState('name')
  const [term, setTerm] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ loans: [], total: 0, page: 1, limit: PER_PAGE })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/loans/jewel/new')
      .then((r) => setSchemes(r.schemes))
      .catch(() => setSchemes([]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams({
        q, field, scheme, status, page: String(page), limit: String(PER_PAGE),
      })
      setData(await api.get(`/loans/jewel?${qs}`))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [q, field, scheme, status, page])

  useEffect(() => {
    load()
  }, [load])

  function search(e) {
    e?.preventDefault()
    setPage(1)
    setQ(term.trim())
  }

  function pickScheme(code) {
    setScheme(code)
    setPage(1)
  }

  const pages = Math.max(1, Math.ceil(data.total / data.limit))

  return (
    <div>
      {/* The scheme radios of the old screen and its search controls are one
          filter, so they share one surface. */}
      <div className="filter-bar">
      <div className="chip-row">
        <button type="button" className={`btn tiny${scheme === '' ? ' primary' : ' ghost'}`} onClick={() => pickScheme('')}>
          All
        </button>
        {schemes.map((s) => (
          <button
            key={s.code}
            type="button"
            className={`btn tiny${scheme === s.code ? ' primary' : ' ghost'}`}
            onClick={() => pickScheme(s.code)}
            title={`GL ${s.code}`}
          >
            {s.name || s.code}
          </button>
        ))}
      </div>

      <form className="toolbar" onSubmit={search}>
        <select value={field} onChange={(e) => setField(e.target.value)} aria-label="Search by">
          {SEARCH_FIELDS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <div className="search">
          <input placeholder="Keyword…" value={term} onChange={(e) => setTerm(e.target.value)} />
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
        <button type="button" className="btn primary" onClick={() => navigate('jl-new')}>
          + Add New
        </button>
      </form>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="card">
        <div className="card-head">
          <strong>{loading ? 'Loading…' : `${data.total} record${data.total === 1 ? '' : 's'} found`}</strong>
          {scheme && <span className="muted">scheme {scheme}</span>}
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Account No</th>
                <th style={{ width: '32%', minWidth: 220 }}>Customer Name</th>
                <th style={{ width: 100 }}>Cust. Id</th>
                <th style={{ width: 110 }}>Open Date</th>
                <th style={{ width: 110 }}>Due Date</th>
                <th style={{ width: 110 }} className="right-align">
                  Loan Amt.
                </th>
                <th style={{ width: 60 }} className="right-align">
                  Mon.
                </th>
                <th style={{ width: 70 }} className="right-align">
                  ROI
                </th>
                <th style={{ width: 90 }}>Status</th>
                <th style={{ width: 120 }} className="right-align">
                  View / Collect
                </th>
              </tr>
            </thead>
            <tbody>
              {!loading && data.loans.length === 0 && (
                <tr>
                  <td colSpan={10} className="muted" style={{ padding: 28, textAlign: 'center' }}>
                    No loans found.
                  </td>
                </tr>
              )}
              {data.loans.map((l) => (
                <tr key={l.id} className="row-link" onClick={() => navigate('jl-view', { id: l.id })}>
                  <td className="mono">{l.accNo}</td>
                  <td className="clamp">
                    {l.customerName}
                    {l.repledged && (
                      <span className="badge warn" style={{ marginLeft: 8 }}>
                        Re-pledged
                      </span>
                    )}
                  </td>
                  <td className="mono">{l.custId}</td>
                  <td>{fmtDate(l.openDate)}</td>
                  <td>{fmtDate(l.dueDate)}</td>
                  <td className="right-align">{fmtMoney(l.loanAmount)}</td>
                  <td className="right-align">{l.periodMonths}</td>
                  <td className="right-align">{fmtMoney(l.interestRate)}</td>
                  <td>
                    <span className={`badge ${l.status === 'A' ? 'ok' : 'neutral'}`}>
                      {l.status === 'A' ? 'Active' : 'Closed'}
                    </span>
                  </td>
                  <td className="right-align" onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">
                      <button className="icon-btn" title="View" onClick={() => navigate('jl-view', { id: l.id })}>
                        👁
                      </button>
                      {l.status === 'A' ? (
                        <button
                          className="icon-btn"
                          title="Collect"
                          onClick={() => navigate('jl-receipt', { accNo: l.accNo })}
                        >
                          ₹
                        </button>
                      ) : (
                        // A closed loan cannot be collected against, but the
                        // slot stays so the View buttons line up down the page.
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
