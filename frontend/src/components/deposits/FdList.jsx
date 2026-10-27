import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate, fmtMoney } from '../../lib/format.js'

// FD_List.aspx rebuilt — the FD Account Master list: the scheme radios across
// the top, a "search by" dropdown with a keyword box, and the record count.
const PER_PAGE = 25

const SEARCH_FIELDS = [
  { value: 'name', label: 'Customer Name' },
  { value: 'accNo', label: 'Account No' },
  { value: 'oldAccNo', label: 'Old Account No' },
  { value: 'custId', label: 'Customer Id' },
]

const REPAYMENT_LABELS = { '1A': 'Monthly', '3A': 'Quarterly', M: 'On maturity' }

export default function FdList({ navigate }) {
  const [schemes, setSchemes] = useState([])
  const [scheme, setScheme] = useState('')
  const [field, setField] = useState('name')
  const [term, setTerm] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ deposits: [], total: 0, page: 1, limit: PER_PAGE })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/deposits/new')
      .then((r) => setSchemes(r.schemes))
      .catch(() => setSchemes([]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams({ q, field, scheme, status, page: String(page), limit: String(PER_PAGE) })
      setData(await api.get(`/deposits?${qs}`))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [q, field, scheme, status, page])

  useEffect(() => {
    load()
  }, [load])

  const pages = Math.max(1, Math.ceil(data.total / data.limit))
  const today = new Date()

  return (
    <div>
      <div className="filter-bar">
        <div className="chip-row">
          <button
            type="button"
            className={`btn tiny${scheme === '' ? ' primary' : ' ghost'}`}
            onClick={() => {
              setScheme('')
              setPage(1)
            }}
          >
            All
          </button>
          {schemes.map((s) => (
            <button
              key={s.code}
              type="button"
              className={`btn tiny${scheme === s.code ? ' primary' : ' ghost'}`}
              onClick={() => {
                setScheme(s.code)
                setPage(1)
              }}
              title={`GL ${s.code}`}
            >
              {s.name}
            </button>
          ))}
        </div>

        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setQ(term.trim())
          }}
        >
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
          <button type="button" className="btn primary" onClick={() => navigate('fd-new')}>
            + Add New
          </button>
        </form>
      </div>

      {error && <div className="notice error">{error}</div>}

      <div className="card">
        <div className="card-head">
          <strong>{loading ? 'Loading…' : `${data.total} record${data.total === 1 ? '' : 's'} found`}</strong>
          {scheme && <span className="muted">{schemes.find((s) => s.code === scheme)?.name}</span>}
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Account No</th>
                <th style={{ width: '24%', minWidth: 180 }}>Customer Name</th>
                <th style={{ width: 100 }}>Cust. Id</th>
                <th style={{ width: 110 }}>Open Date</th>
                <th style={{ width: 110 }}>Maturity Date</th>
                <th style={{ width: 60 }} className="right-align">
                  Mon.
                </th>
                <th style={{ width: 70 }} className="right-align">
                  ROI
                </th>
                <th style={{ width: 120 }} className="right-align">
                  Deposit
                </th>
                <th style={{ width: 120 }} className="right-align">
                  Maturity Amt.
                </th>
                <th style={{ width: 90 }}>Status</th>
                <th style={{ width: 110 }} className="right-align">
                  Edit / View
                </th>
              </tr>
            </thead>
            <tbody>
              {!loading && data.deposits.length === 0 && (
                <tr>
                  <td colSpan={11} className="muted" style={{ padding: 28, textAlign: 'center' }}>
                    No deposits found.
                  </td>
                </tr>
              )}
              {data.deposits.map((d) => {
                const due = d.status === 'A' && new Date(d.maturityDate) <= today
                return (
                  <tr key={d.id} className="row-link" onClick={() => navigate('fd-view', { id: d.id })}>
                    <td className="mono">{d.accNo}</td>
                    <td className="clamp">{d.customerName}</td>
                    <td className="mono">{d.custId}</td>
                    <td>{fmtDate(d.openDate)}</td>
                    <td>
                      {fmtDate(d.maturityDate)}
                      {due && (
                        <span className="badge warn" style={{ marginLeft: 6 }}>
                          Matured
                        </span>
                      )}
                    </td>
                    <td className="right-align">{d.periodMonths}</td>
                    <td className="right-align">{fmtMoney(d.interestRate)}</td>
                    <td className="right-align">{fmtMoney(d.depositAmount)}</td>
                    <td className="right-align">
                      {fmtMoney(d.maturityAmount)}
                      <small className="muted" style={{ display: 'block' }}>
                        {REPAYMENT_LABELS[d.interestRepayment] || ''}
                      </small>
                    </td>
                    <td>
                      <span className={`badge ${d.status === 'A' ? 'ok' : 'neutral'}`}>
                        {d.status === 'A' ? 'Active' : 'Closed'}
                      </span>
                    </td>
                    <td className="right-align" onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        <button className="icon-btn" title="View" onClick={() => navigate('fd-view', { id: d.id })}>
                          👁
                        </button>
                        {d.status === 'A' ? (
                          <button
                            className="icon-btn"
                            title="Interest payment"
                            onClick={() => navigate('fd-interest', { accNo: d.accNo })}
                          >
                            ₹
                          </button>
                        ) : (
                          <span className="icon-slot" aria-hidden="true" />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
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
