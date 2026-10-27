import { useEffect, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate, fmtMoney } from '../../lib/format.js'
import { emitReport } from '../../lib/report.js'

// Loan_Reports.aspx rebuilt: the same filters in the same order — scheme,
// account status, account-number range, three date ranges, a condition on the
// closing balance and another on how long interest has been outstanding, a
// grouping, the day to value it on, gender and purpose.

const today = () => new Date().toISOString().slice(0, 10)

// The two "condition" dropdowns of the old screen, with its own wording.
const CONDITIONS = [
  { value: '', label: 'is any value' },
  { value: '>', label: 'is greater than' },
  { value: '>=', label: 'is greater than or equal to' },
  { value: 'between', label: 'is between' },
  { value: '<', label: 'is less than' },
  { value: '<=', label: 'is less than or equal to' },
]

const GROUPS = [
  { value: '', label: 'None' },
  { value: 'rate', label: 'Interest Rate' },
  { value: 'period', label: 'Loan Period' },
  { value: 'scheme', label: 'Loan Scheme' },
  { value: 'customer', label: 'Customer' },
  { value: 'purpose', label: 'Purpose' },
]

const PURPOSES = [
  'Walk-in', 'Re-Loan', 'Renewal', 'Take Over',
  'Door Step Marketing', 'Personal Marketing', 'Referral',
]

const BLANK = {
  scheme: '', active: true, closed: false,
  accFrom: '', accTo: '',
  openFrom: '', openTo: '', dueFrom: '', dueTo: '', closedFrom: '', closedTo: '',
  balCond: '', balV1: '', balV2: '',
  odCond: '', odV1: '', odV2: '',
  groupBy: '', asOn: today(), gender: '', purpose: '', withInterest: true,
}

const COLUMNS = [
  { key: 'accNo', label: 'Account No' },
  { key: 'customerName', label: 'Customer Name' },
  { key: 'schemeCode', label: 'Scheme' },
  { key: 'openDate', label: 'Open Date', value: (r) => fmtDate(r.openDate) },
  { key: 'dueDate', label: 'Due Date', value: (r) => fmtDate(r.dueDate) },
  { key: 'interestRate', label: 'ROI', align: 'right' },
  { key: 'odDays', label: 'OD Days', align: 'right' },
  { key: 'loanAmount', label: 'Loan Amt.', align: 'right', value: (r) => fmtMoney(r.loanAmount) },
  { key: 'principalBalance', label: 'Balance', align: 'right', value: (r) => fmtMoney(r.principalBalance) },
  { key: 'totalDue', label: 'Total Due', align: 'right', value: (r) => fmtMoney(r.totalDue) },
]

export default function JlLoanReports({ navigate }) {
  const [f, setF] = useState(BLANK)
  const [schemes, setSchemes] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [format, setFormat] = useState('PDF')

  const set = (k, type) => (e) =>
    setF((s) => ({ ...s, [k]: type === 'checkbox' ? e.target.checked : e.target.value }))

  useEffect(() => {
    api
      .get('/loans/jewel/new')
      .then((d) => setSchemes(d.schemes))
      .catch(() => {})
  }, [])

  async function run(e) {
    e?.preventDefault()
    setLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams(
        Object.fromEntries(
          Object.entries(f).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? '1' : '0') : v])
        )
      )
      setData(await api.get(`/loans/reports/loans?${qs}`))
    } catch (e2) {
      setError(e2.message)
    } finally {
      setLoading(false)
    }
  }

  async function exportIt() {
    if (!data) return
    const used = [
      ['Scheme', f.scheme || 'All'],
      ['A/c Status', [f.active && 'Active', f.closed && 'Closed'].filter(Boolean).join(', ') || 'None'],
      ['A/c No.', [f.accFrom, f.accTo].filter(Boolean).join(' to ')],
      ['Open Date', [f.openFrom, f.openTo].filter(Boolean).map(fmtDate).join(' to ')],
      ['Due Date', [f.dueFrom, f.dueTo].filter(Boolean).map(fmtDate).join(' to ')],
      ['Closed Date', [f.closedFrom, f.closedTo].filter(Boolean).map(fmtDate).join(' to ')],
      ['Group By', GROUPS.find((g) => g.value === f.groupBy)?.label],
      ['O/s as on', fmtDate(f.asOn)],
      ['Purpose', f.purpose],
    ]
    try {
      await emitReport(format, {
        title: 'Jewel Loan Report',
        fileName: 'Jewel_Loan_Report',
        branch: data.branch,
        meta: used,
        columns: COLUMNS.map((c) => ({
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

  // The report renders flat or in groups, so the body is built once either way.
  const blocks = data ? (data.groups ? data.groups : [{ key: null, rows: data.rows, total: 0 }]) : []

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>JL Reports</h2>
            <p className="muted">The whole loan book, narrowed however you need it.</p>
          </div>
          <div className="master-head-right">
            <select value={format} onChange={(e) => setFormat(e.target.value)} aria-label="File type">
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

          <form className="frm" onSubmit={run}>
            <Row label="Scheme">
              <select value={f.scheme} onChange={set('scheme')}>
                <option value="">All</option>
                {schemes.map((s) => (
                  <option key={s.code} value={s.code}>
                    JL-{s.name}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="A/c Status">
              <div className="check-row">
                <label className="inline-check">
                  <input type="checkbox" checked={f.active} onChange={set('active', 'checkbox')} />
                  Active
                </label>
                <label className="inline-check">
                  <input type="checkbox" checked={f.closed} onChange={set('closed', 'checkbox')} />
                  Closed
                </label>
              </div>
            </Row>

            <Row label="A/c No. From">
              <input className="mono" value={f.accFrom} onChange={set('accFrom')} placeholder="201600001" />
            </Row>
            <Row label="A/c No. To">
              <input className="mono" value={f.accTo} onChange={set('accTo')} placeholder="201600367" />
            </Row>

            <Row label="Open Date b/w">
              <input type="date" value={f.openFrom} onChange={set('openFrom')} />
            </Row>
            <Row label="To Date">
              <input type="date" value={f.openTo} onChange={set('openTo')} />
            </Row>

            <Row label="Due Date b/w">
              <input type="date" value={f.dueFrom} onChange={set('dueFrom')} />
            </Row>
            <Row label="To Date">
              <input type="date" value={f.dueTo} onChange={set('dueTo')} />
            </Row>

            <Row label="Closed Date b/w">
              <input type="date" value={f.closedFrom} onChange={set('closedFrom')} />
            </Row>
            <Row label="To Date">
              <input type="date" value={f.closedTo} onChange={set('closedTo')} />
            </Row>

            <Row label="Closing Balance" span={3}>
              <Condition
                cond={f.balCond}
                v1={f.balV1}
                v2={f.balV2}
                onCond={set('balCond')}
                onV1={set('balV1')}
                onV2={set('balV2')}
              />
            </Row>

            <Row label="Days overdue" span={3}>
              <Condition
                cond={f.odCond}
                v1={f.odV1}
                v2={f.odV2}
                onCond={set('odCond')}
                onV1={set('odV1')}
                onV2={set('odV2')}
              />
            </Row>

            <Row label="Group By">
              <select value={f.groupBy} onChange={set('groupBy')}>
                {GROUPS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="O/s as on">
              <input type="date" value={f.asOn} onChange={set('asOn')} />
            </Row>

            <Row label="Gender">
              <select value={f.gender} onChange={set('gender')}>
                <option value="">All</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="U">Not set</option>
              </select>
            </Row>
            <Row label="Purpose">
              <select value={f.purpose} onChange={set('purpose')}>
                <option value="">All</option>
                {PURPOSES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Row>

            <Row label="With interest">
              <label className="inline-check">
                <input type="checkbox" checked={f.withInterest} onChange={set('withInterest', 'checkbox')} />
                Work out what is due as well
              </label>
            </Row>
            <Row label=" ">
              <div className="check-row">
                <button className="btn primary" type="submit" disabled={loading}>
                  {loading ? 'Working…' : 'Report'}
                </button>
                <button type="button" className="btn ghost" onClick={() => setF(BLANK)}>
                  Reset
                </button>
              </div>
            </Row>
          </form>

          {data && (
            <>
              <div className="chip-row" style={{ marginTop: 18 }}>
                <span className="badge neutral">{data.totals.count} loans</span>
                <span className="badge neutral">{data.totals.netWeight} g</span>
                <span className="badge neutral">lent ₹{fmtMoney(data.totals.loanAmount)}</span>
                <span className="badge neutral">balance ₹{fmtMoney(data.totals.balance)}</span>
                <span className="badge neutral">due ₹{fmtMoney(data.totals.totalDue)}</span>
              </div>

              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="grid">
                  <thead>
                    <tr>
                      {COLUMNS.map((c) => (
                        <th key={c.key} className={c.align === 'right' ? 'right-align' : undefined}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.length === 0 && (
                      <tr>
                        <td colSpan={COLUMNS.length} className="muted" style={{ padding: 24, textAlign: 'center' }}>
                          Nothing matches those filters.
                        </td>
                      </tr>
                    )}
                    {blocks.map((g) => (
                      <GroupRows key={g.key ?? 'all'} group={g} navigate={navigate} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function GroupRows({ group, navigate }) {
  return (
    <>
      {group.key !== null && (
        <tr>
          <th colSpan={COLUMNS.length - 1}>{group.key}</th>
          <th className="right-align">₹{fmtMoney(group.total)}</th>
        </tr>
      )}
      {group.rows.map((r) => (
        <tr key={r.id} className="row-link" onClick={() => navigate('jl-view', { id: r.id })}>
          {COLUMNS.map((c) => (
            <td key={c.key} className={c.align === 'right' ? 'right-align' : undefined}>
              {c.value ? c.value(r) : (r[c.key] ?? '—')}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// A dropdown and the one or two numbers it needs — the old screen's
// "is greater than 5000" / "is between 1000 and 2000".
function Condition({ cond, v1, v2, onCond, onV1, onV2 }) {
  return (
    <div className="check-row">
      <select value={cond} onChange={onCond} style={{ maxWidth: 260 }}>
        {CONDITIONS.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      {cond && (
        <input type="number" step="0.01" value={v1} onChange={onV1} style={{ maxWidth: 160 }} placeholder="value" />
      )}
      {cond === 'between' && (
        <>
          <span className="muted">and</span>
          <input type="number" step="0.01" value={v2} onChange={onV2} style={{ maxWidth: 160 }} placeholder="value" />
        </>
      )}
    </div>
  )
}

function Row({ label, span = 1, children }) {
  return (
    <>
      <label className="lbl">{label}</label>
      <div className={`cell${span > 1 ? ` span-${span}` : ''}`}>{children}</div>
    </>
  )
}
