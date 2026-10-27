import { useEffect, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate, fmtMoney } from '../../lib/format.js'
import { emitReport } from '../../lib/report.js'

// The old system reused one page for a whole family of reports, told apart by
// a query parameter. The three jewel-loan reports — stock register, overdue
// list and auction notice list — are the same screen: a filter bar, the rows
// on screen, and the same rows out as PDF, Excel or Word.

const today = () => new Date().toISOString().slice(0, 10)
const money = (k) => (r) => fmtMoney(r[k])
const date = (k) => (r) => fmtDate(r[k])

/* ------------------------------------------------------------ definitions */

const STOCK = {
  key: 'stock',
  title: 'JL Stock Register',
  lead: 'What is held in the strong room, and what moved in or out.',
  path: (f) => `/loans/reports/stock?type=${f.type}&from=${f.from}&to=${f.to}`,
  filters: [
    {
      name: 'type', label: 'Register', type: 'select', value: 'held',
      options: [
        { value: 'held', label: 'Jewels held now' },
        { value: 'open', label: 'Pledged in the period' },
        { value: 'closed', label: 'Released in the period' },
      ],
    },
    { name: 'from', label: 'From date', type: 'date', value: '' },
    { name: 'to', label: 'To date', type: 'date', value: '' },
  ],
  columns: [
    { key: 'accNo', label: 'Account No' },
    { key: 'customerName', label: 'Customer Name' },
    { key: 'openDate', label: 'Open Date', value: date('openDate') },
    { key: 'jewels', label: 'Jewels' },
    { key: 'noOfItems', label: 'Items', align: 'right' },
    { key: 'netWeight', label: 'Net (g)', align: 'right' },
    { key: 'loanAmount', label: 'Loan Amt.', align: 'right', value: money('loanAmount') },
    { key: 'principalBalance', label: 'Balance', align: 'right', value: money('principalBalance') },
  ],
  summary: (t) =>
    [`${t.count} pledges`, `${t.items} items`, `${t.netWeight} g net`, `₹${fmtMoney(t.balance)} outstanding`],
}

const OD = {
  key: 'od',
  title: 'JL OD Status',
  lead: 'Loans past their due date, with what each one owes today.',
  path: (f) =>
    `/loans/reports/od?scheme=${f.scheme}&dueFrom=${f.dueFrom}&dueTo=${f.dueTo}&asOn=${f.asOn}&withInterest=${
      f.withInterest ? '1' : '0'
    }`,
  filters: [
    { name: 'scheme', label: 'Scheme', type: 'scheme', value: '' },
    { name: 'dueFrom', label: 'Due from', type: 'date', value: '' },
    { name: 'dueTo', label: 'Due to', type: 'date', value: '' },
    { name: 'asOn', label: 'As on', type: 'date', value: today() },
    { name: 'withInterest', label: 'With interest', type: 'checkbox', value: true },
  ],
  columns: [
    { key: 'accNo', label: 'Account No' },
    { key: 'customerName', label: 'Customer Name' },
    { key: 'dueDate', label: 'Due Date', value: date('dueDate') },
    { key: 'odDays', label: 'OD Days', align: 'right' },
    { key: 'principalBalance', label: 'Principal', align: 'right', value: money('principalBalance') },
    { key: 'interestDue', label: 'Interest', align: 'right', value: money('interestDue') },
    { key: 'penalDue', label: 'Penal', align: 'right', value: money('penalDue') },
    { key: 'totalDue', label: 'Total Due', align: 'right', value: money('totalDue') },
  ],
  summary: (t) => [`${t.count} overdue`, `₹${fmtMoney(t.balance)} principal`, `₹${fmtMoney(t.totalDue)} due`],
}

const AUCTION = {
  key: 'auction',
  title: 'JL Notice',
  lead: 'The overdue pledges old enough to be called for auction.',
  path: (f) =>
    `/loans/reports/auction?daysFrom=${f.daysFrom}&daysTo=${f.daysTo}&asOn=${f.asOn}&scheme=${f.scheme}&otherCharges=${f.otherCharges}`,
  filters: [
    { name: 'daysFrom', label: 'OD days from', type: 'number', value: '90' },
    { name: 'daysTo', label: 'OD days to', type: 'number', value: '' },
    { name: 'asOn', label: 'As on', type: 'date', value: today() },
    { name: 'scheme', label: 'Scheme', type: 'scheme', value: '' },
    { name: 'otherCharges', label: 'Other charges', type: 'number', value: '' },
  ],
  columns: [
    { key: 'accNo', label: 'Account No' },
    { key: 'customerName', label: 'Customer Name' },
    { key: 'address', label: 'Address' },
    { key: 'dueDate', label: 'Due Date', value: date('dueDate') },
    { key: 'odDays', label: 'OD Days', align: 'right' },
    { key: 'netWeight', label: 'Net (g)', align: 'right' },
    { key: 'totalDue', label: 'Amount Due', align: 'right', value: money('totalDue') },
  ],
  summary: (t) => [`${t.count} notices`, `₹${fmtMoney(t.totalDue)} called for`],
}

const OUTSTANDING = {
  key: 'os',
  title: 'JL O/s as on',
  lead: 'What was still owed on a chosen day — receipts taken after it are put back.',
  path: (f) => `/loans/reports/outstanding?asOn=${f.asOn}&scheme=${f.scheme}&withInterest=${f.withInterest ? '1' : '0'}`,
  filters: [
    { name: 'asOn', label: 'Outstanding as on', type: 'date', value: today() },
    { name: 'scheme', label: 'Scheme', type: 'scheme', value: '' },
    { name: 'withInterest', label: 'With interest', type: 'checkbox', value: true },
  ],
  columns: [
    { key: 'accNo', label: 'Account No' },
    { key: 'customerName', label: 'Customer Name' },
    { key: 'openDate', label: 'Open Date', value: date('openDate') },
    { key: 'dueDate', label: 'Due Date', value: date('dueDate') },
    { key: 'netWeight', label: 'Net (g)', align: 'right' },
    { key: 'loanAmount', label: 'Loan Amt.', align: 'right', value: money('loanAmount') },
    { key: 'principalBalance', label: 'Balance', align: 'right', value: money('principalBalance') },
    { key: 'interestDue', label: 'Interest', align: 'right', value: money('interestDue') },
    { key: 'totalDue', label: 'Total Due', align: 'right', value: money('totalDue') },
  ],
  summary: (t) => [
    `${t.count} accounts`,
    `${t.netWeight} g`,
    `₹${fmtMoney(t.balance)} principal`,
    `₹${fmtMoney(t.totalDue)} with interest`,
  ],
}

export const JlStockRegister = (p) => <ReportScreen {...p} def={STOCK} />
export const JlOutstanding = (p) => <ReportScreen {...p} def={OUTSTANDING} />
export const JlOdReport = (p) => <ReportScreen {...p} def={OD} />
export const JlAuctionNotice = (p) => <ReportScreen {...p} def={AUCTION} />

/* ---------------------------------------------------------------- screen */

function ReportScreen({ def, navigate }) {
  const [filters, setFilters] = useState(() =>
    Object.fromEntries(def.filters.map((f) => [f.name, f.value]))
  )
  const [schemes, setSchemes] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [format, setFormat] = useState('PDF')

  useEffect(() => {
    if (!def.filters.some((f) => f.type === 'scheme')) return
    api
      .get('/loans/jewel/new')
      .then((d) => setSchemes(d.schemes))
      .catch(() => {})
  }, [def])

  // Re-run whenever a filter moves. These are small, branch-scoped lists.
  useEffect(() => {
    let dead = false
    setLoading(true)
    api
      .get(def.path(filters))
      .then((r) => {
        if (dead) return
        setData(r)
        setError('')
      })
      .catch((e) => !dead && setError(e.message))
      .finally(() => !dead && setLoading(false))
    return () => {
      dead = true
    }
  }, [def, filters])

  async function exportIt() {
    if (!data) return
    try {
      await emitReport(format, {
        title: def.title,
        fileName: def.title.replace(/\s+/g, '_'),
        branch: data.branch,
        meta: def.filters
          .map((f) => [f.label, f.type === 'checkbox' ? (filters[f.name] ? 'Yes' : 'No') : filters[f.name]])
          .filter(([, v]) => v !== '' && v !== undefined),
        columns: def.columns.map((c) => ({
          label: c.label,
          align: c.align,
          value: c.value || ((r) => r[c.key] ?? ''),
        })),
        rows: data.rows,
      })
    } catch (e) {
      setError(e.message)
    }
  }

  const set = (name, type) => (e) =>
    setFilters((f) => ({ ...f, [name]: type === 'checkbox' ? e.target.checked : e.target.value }))

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>{def.title}</h2>
            <p className="muted">{def.lead}</p>
          </div>
          <div className="master-head-right">
            <select value={format} onChange={(e) => setFormat(e.target.value)} aria-label="Export format">
              <option>PDF</option>
              <option>Excel</option>
              <option>Word</option>
            </select>
            <button className="btn" onClick={exportIt} disabled={!data || loading}>
              Export
            </button>
            <button className="btn ghost" onClick={() => navigate('jl-list')}>
              Close
            </button>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <div className="frm">
            {def.filters.map((f) => (
              <Row key={f.name} label={f.label}>
                {f.type === 'select' && (
                  <select value={filters[f.name]} onChange={set(f.name)}>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
                {f.type === 'scheme' && (
                  <select value={filters[f.name]} onChange={set(f.name)}>
                    <option value="">All schemes</option>
                    {schemes.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </select>
                )}
                {f.type === 'checkbox' && (
                  <label className="inline-check">
                    <input type="checkbox" checked={!!filters[f.name]} onChange={set(f.name, 'checkbox')} />
                    Include it
                  </label>
                )}
                {(f.type === 'date' || f.type === 'number' || f.type === 'text') && (
                  <input type={f.type} value={filters[f.name]} onChange={set(f.name)} />
                )}
              </Row>
            ))}
          </div>

          {data && (
            <div className="chip-row" style={{ marginTop: 14 }}>
              {def.summary(data.totals).map((s) => (
                <span key={s} className="badge neutral">
                  {s}
                </span>
              ))}
            </div>
          )}

          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="grid">
              <thead>
                <tr>
                  {def.columns.map((c) => (
                    <th key={c.key} className={c.align === 'right' ? 'right-align' : undefined}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={def.columns.length} className="muted" style={{ padding: 24, textAlign: 'center' }}>
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading &&
                  data?.rows.length === 0 && (
                    <tr>
                      <td colSpan={def.columns.length} className="muted" style={{ padding: 24, textAlign: 'center' }}>
                        Nothing matches those filters.
                      </td>
                    </tr>
                  )}
                {!loading &&
                  data?.rows.map((r) => (
                    <tr key={r.id || r.accNo}>
                      {def.columns.map((c) => (
                        <td key={c.key} className={c.align === 'right' ? 'right-align' : undefined}>
                          {c.value ? c.value(r) : (r[c.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <>
      <label className="lbl">{label}</label>
      <div className="cell">{children}</div>
    </>
  )
}
