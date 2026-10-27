import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate, fmtMoney } from '../../lib/format.js'
import { emitReport } from '../../lib/report.js'

// FD Maturity, FD Reports, the account statement and O/s as on.

const today = () => new Date().toISOString().slice(0, 10)
const inDays = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10)

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
  { value: 'period', label: 'Deposit Period' },
  { value: 'scheme', label: 'Deposit Scheme' },
  { value: 'customer', label: 'Customer' },
]

const COLUMNS = [
  { key: 'accNo', label: 'Account No' },
  { key: 'customerName', label: 'Customer Name' },
  { key: 'custId', label: 'Cust. Id' },
  { key: 'openDate', label: 'Open Date', value: (r) => fmtDate(r.openDate) },
  { key: 'maturityDate', label: 'Maturity Date', value: (r) => fmtDate(r.maturityDate) },
  { key: 'periodMonths', label: 'Mon.', align: 'right' },
  { key: 'interestRate', label: 'ROI', align: 'right' },
  { key: 'depositAmount', label: 'Deposit', align: 'right', value: (r) => fmtMoney(r.depositAmount) },
  { key: 'maturityAmount', label: 'Maturity Amt.', align: 'right', value: (r) => fmtMoney(r.maturityAmount) },
  { key: 'status', label: 'Status' },
]

/* -------------------------------------------------------------- maturity */

export function FdMaturity({ navigate }) {
  const [f, setF] = useState({ from: today(), to: inDays(30), scheme: '' })
  const [schemes, setSchemes] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [format, setFormat] = useState('Excel')

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  useEffect(() => {
    api
      .get('/deposits/new')
      .then((d) => setSchemes(d.schemes))
      .catch(() => {})
  }, [])

  useEffect(() => {
    let dead = false
    setLoading(true)
    api
      .get(`/deposits/reports/maturity?from=${f.from}&to=${f.to}&scheme=${f.scheme}`)
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
  }, [f])

  async function exportIt() {
    if (!data) return
    try {
      await emitReport(format, {
        title: 'FD Maturity',
        fileName: 'FD_Maturity',
        branch: data.branch,
        meta: [
          ['From Date', fmtDate(f.from)],
          ['To Date', fmtDate(f.to)],
          ['Deposits', data.totals.count],
          ['Maturity value', fmtMoney(data.totals.maturity)],
        ],
        columns: [
          ...COLUMNS.slice(0, 9).map((c) => ({
            label: c.label,
            align: c.align,
            value: c.value || ((r) => r[c.key] ?? ''),
          })),
          { label: 'Days', align: 'right', value: (r) => r.daysToGo },
        ],
        rows: data.rows,
      })
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>FD Maturity</h2>
            <p className="muted">What falls due between two dates — the list the maturity notices are cut from.</p>
          </div>
          <div className="master-head-right">
            <select value={format} onChange={(e) => setFormat(e.target.value)} aria-label="File type">
              <option>Excel</option>
              <option>PDF</option>
              <option>Word</option>
            </select>
            <button className="btn" onClick={exportIt} disabled={!data || loading}>
              Export
            </button>
            <button className="btn ghost" onClick={() => navigate('fd-list')}>
              Close
            </button>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <div className="frm">
            <Row label="From Date">
              <input type="date" value={f.from} onChange={set('from')} />
            </Row>
            <Row label="To Date">
              <input type="date" value={f.to} onChange={set('to')} />
            </Row>
            <Row label="Scheme">
              <select value={f.scheme} onChange={set('scheme')}>
                <option value="">All schemes</option>
                {schemes.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Row>
          </div>

          {data && (
            <div className="chip-row" style={{ marginTop: 16 }}>
              <span className="badge neutral">{data.totals.count} deposits</span>
              <span className="badge neutral">deposited ₹{fmtMoney(data.totals.deposit)}</span>
              <span className="badge ok">maturing to ₹{fmtMoney(data.totals.maturity)}</span>
            </div>
          )}

          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="grid">
              <thead>
                <tr>
                  {COLUMNS.slice(0, 9).map((c) => (
                    <th key={c.key} className={c.align === 'right' ? 'right-align' : undefined}>
                      {c.label}
                    </th>
                  ))}
                  <th className="right-align">Days</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={10} className="muted" style={{ padding: 24, textAlign: 'center' }}>
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && data?.rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="muted" style={{ padding: 24, textAlign: 'center' }}>
                      Nothing matures in that window.
                    </td>
                  </tr>
                )}
                {!loading &&
                  data?.rows.map((r) => (
                    <tr key={r.id} className="row-link" onClick={() => navigate('fd-view', { id: r.id })}>
                      {COLUMNS.slice(0, 9).map((c) => (
                        <td key={c.key} className={c.align === 'right' ? 'right-align' : undefined}>
                          {c.value ? c.value(r) : (r[c.key] ?? '—')}
                        </td>
                      ))}
                      <td className="right-align">
                        {r.daysToGo < 0 ? (
                          <span className="badge warn">{-r.daysToGo} overdue</span>
                        ) : (
                          r.daysToGo
                        )}
                      </td>
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

/* --------------------------------------------------------------- reports */

export function FdReportsScreen({ navigate }) {
  const [f, setF] = useState({
    scheme: '', active: true, closed: false,
    accFrom: '', accTo: '', openFrom: '', openTo: '',
    matFrom: '', matTo: '', closedFrom: '', closedTo: '',
    amtCond: '', amtV1: '', amtV2: '', groupBy: '',
  })
  const [schemes, setSchemes] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [format, setFormat] = useState('PDF')

  const set = (k, type) => (e) =>
    setF((s) => ({ ...s, [k]: type === 'checkbox' ? e.target.checked : e.target.value }))

  useEffect(() => {
    api
      .get('/deposits/new')
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
      setData(await api.get(`/deposits/reports/list?${qs}`))
    } catch (e2) {
      setError(e2.message)
    } finally {
      setLoading(false)
    }
  }

  async function exportIt() {
    if (!data) return
    try {
      await emitReport(format, {
        title: 'Fixed Deposit Report',
        fileName: 'Fixed_Deposit_Report',
        branch: data.branch,
        meta: [
          ['Scheme', f.scheme || 'All'],
          ['A/c Status', [f.active && 'Active', f.closed && 'Closed'].filter(Boolean).join(', ') || 'None'],
          ['A/c No.', [f.accFrom, f.accTo].filter(Boolean).join(' to ')],
          ['Open Date', [f.openFrom, f.openTo].filter(Boolean).map(fmtDate).join(' to ')],
          ['Maturity Date', [f.matFrom, f.matTo].filter(Boolean).map(fmtDate).join(' to ')],
          ['Group By', GROUPS.find((g) => g.value === f.groupBy)?.label],
          ['Deposits', data.totals.count],
        ],
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

  const blocks = data ? (data.groups ? data.groups : [{ key: null, rows: data.rows, total: 0 }]) : []

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>FD Reports</h2>
            <p className="muted">The deposit book, narrowed however you need it.</p>
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
            <button className="btn ghost" onClick={() => navigate('fd-list')}>
              Close
            </button>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <form className="frm" onSubmit={run}>
            <Row label="Scheme">
              <select value={f.scheme} onChange={set('scheme')}>
                <option value="">All Fixed Deposits</option>
                {schemes.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
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
              <input className="mono" value={f.accFrom} onChange={set('accFrom')} />
            </Row>
            <Row label="A/c No. To">
              <input className="mono" value={f.accTo} onChange={set('accTo')} />
            </Row>

            <Row label="Open Date b/w">
              <input type="date" value={f.openFrom} onChange={set('openFrom')} />
            </Row>
            <Row label="To Date">
              <input type="date" value={f.openTo} onChange={set('openTo')} />
            </Row>

            <Row label="Maturity b/w">
              <input type="date" value={f.matFrom} onChange={set('matFrom')} />
            </Row>
            <Row label="To Date">
              <input type="date" value={f.matTo} onChange={set('matTo')} />
            </Row>

            <Row label="Closed Date b/w">
              <input type="date" value={f.closedFrom} onChange={set('closedFrom')} />
            </Row>
            <Row label="To Date">
              <input type="date" value={f.closedTo} onChange={set('closedTo')} />
            </Row>

            <Row label="Deposit Amount" span={3}>
              <div className="check-row">
                <select value={f.amtCond} onChange={set('amtCond')} style={{ maxWidth: 260 }}>
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {f.amtCond && (
                  <input type="number" step="0.01" value={f.amtV1} onChange={set('amtV1')} style={{ maxWidth: 160 }} />
                )}
                {f.amtCond === 'between' && (
                  <>
                    <span className="muted">and</span>
                    <input type="number" step="0.01" value={f.amtV2} onChange={set('amtV2')} style={{ maxWidth: 160 }} />
                  </>
                )}
              </div>
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
            <Row label=" ">
              <button className="btn primary" type="submit" disabled={loading}>
                {loading ? 'Working…' : 'Report'}
              </button>
            </Row>
          </form>

          {data && (
            <>
              <div className="chip-row" style={{ marginTop: 16 }}>
                <span className="badge neutral">{data.totals.count} deposits</span>
                <span className="badge neutral">deposited ₹{fmtMoney(data.totals.deposit)}</span>
                <span className="badge neutral">maturing to ₹{fmtMoney(data.totals.maturity)}</span>
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
        <tr key={r.id} className="row-link" onClick={() => navigate('fd-view', { id: r.id })}>
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

/* ------------------------------------------------------------- statement */

export function FdStatement({ navigate, accNo: initialAccNo }) {
  const [accNo, setAccNo] = useState(initialAccNo || '')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [format, setFormat] = useState('PDF')
  const accRef = useRef(null)

  const load = useCallback(async (no) => {
    const v = String(no || '').trim()
    if (!v) return
    try {
      setData(await api.get(`/deposits/${encodeURIComponent(v)}/statement`))
      setError('')
    } catch (e) {
      setData(null)
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    if (initialAccNo) load(initialAccNo)
    else accRef.current?.focus()
  }, [initialAccNo, load])

  async function exportIt() {
    if (!data) return
    try {
      await emitReport(format, {
        title: 'Fixed Deposit Statement',
        fileName: `FD_Statement_${data.deposit.accNo}`,
        branch: data.branch,
        meta: [
          ['Account No', data.deposit.accNo],
          ['Customer', `${data.deposit.custId} / ${data.deposit.customerName}`],
          ['Deposit', fmtMoney(data.deposit.depositAmount)],
          ['Maturity', `${fmtDate(data.deposit.maturityDate)} · ${fmtMoney(data.deposit.maturityAmount)}`],
          ['Interest paid', fmtMoney(data.totals.interestPaid)],
        ],
        columns: [
          { label: 'Date', value: (r) => fmtDate(r.transDate) },
          { label: 'Trans. Id', value: (r) => r.transId },
          { label: 'Particulars', value: (r) => r.particulars },
          { label: 'In', align: 'right', value: (r) => (r.credit ? fmtMoney(r.credit) : '') },
          { label: 'Out', align: 'right', value: (r) => (r.debit ? fmtMoney(r.debit) : '') },
          { label: 'TDS', align: 'right', value: (r) => (r.tds ? fmtMoney(r.tds) : '') },
        ],
        rows: data.lines,
      })
    } catch (e) {
      setError(e.message)
    }
  }

  const d = data?.deposit

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>Account Statement</h2>
            <p className="muted">{d ? `${d.accNo} · ${d.customerName}` : 'One term deposit, from the day it opened'}</p>
          </div>
          <div className="master-head-right">
            <select value={format} onChange={(e) => setFormat(e.target.value)} aria-label="File type">
              <option>PDF</option>
              <option>Excel</option>
              <option>Word</option>
            </select>
            <button className="btn" onClick={exportIt} disabled={!data}>
              Export
            </button>
            <button className="btn ghost" onClick={() => navigate('fd-list')}>
              Close
            </button>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <form
            className="frm"
            onSubmit={(e) => {
              e.preventDefault()
              load(accNo)
            }}
          >
            <Row label="Account No" req>
              <div className="input-with-btn">
                <input
                  ref={accRef}
                  className="mono"
                  value={accNo}
                  onChange={(e) => setAccNo(e.target.value)}
                  placeholder="201300001"
                />
                <button type="submit" className="btn ghost">
                  Go
                </button>
              </div>
            </Row>
            <Row label="Customer">
              <input value={d ? `${d.custId} / ${d.customerName}` : ''} readOnly />
            </Row>
          </form>

          {data && (
            <>
              <div className="stat-grid" style={{ marginTop: 18 }}>
                <Stat label="Deposit" value={fmtMoney(d.depositAmount)} />
                <Stat label="Maturity amount" value={fmtMoney(d.maturityAmount)} />
                <Stat label="Interest paid" value={fmtMoney(data.totals.interestPaid)} />
                <Stat label="Maturity date" value={fmtDate(d.maturityDate)} />
              </div>

              <div className="table-wrap" style={{ marginTop: 16 }}>
                <table className="grid">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Date</th>
                      <th style={{ width: 100 }}>Trans. Id</th>
                      <th>Particulars</th>
                      <th className="right-align">In</th>
                      <th className="right-align">Out</th>
                      <th className="right-align">TDS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{fmtDate(l.transDate)}</td>
                        <td className="mono">{l.transId || '—'}</td>
                        <td className="clamp">{l.particulars}</td>
                        <td className="right-align">{l.credit ? fmtMoney(l.credit) : ''}</td>
                        <td className="right-align">{l.debit ? fmtMoney(l.debit) : ''}</td>
                        <td className="right-align">{l.tds ? fmtMoney(l.tds) : ''}</td>
                      </tr>
                    ))}
                    {data.lines.length === 0 && (
                      <tr>
                        <td colSpan={6} className="muted" style={{ padding: 22, textAlign: 'center' }}>
                          Nothing posted on this deposit.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={3}>Total</th>
                      <th className="right-align">{fmtMoney(data.totals.credit)}</th>
                      <th className="right-align">{fmtMoney(data.totals.debit)}</th>
                      <th />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- O/s as on */

export function FdOutstanding({ navigate }) {
  const [f, setF] = useState({ asOn: today(), scheme: '' })
  const [schemes, setSchemes] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [format, setFormat] = useState('PDF')

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  useEffect(() => {
    api
      .get('/deposits/new')
      .then((d) => setSchemes(d.schemes))
      .catch(() => {})
  }, [])

  useEffect(() => {
    let dead = false
    setLoading(true)
    api
      .get(`/deposits/reports/outstanding?asOn=${f.asOn}&scheme=${f.scheme}`)
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
  }, [f])

  async function exportIt() {
    if (!data) return
    try {
      await emitReport(format, {
        title: 'Term Deposit O/s as on',
        fileName: 'FD_Outstanding',
        branch: data.branch,
        meta: [
          ['Outstanding as on', fmtDate(data.asOn)],
          ['Scheme', f.scheme || 'All'],
          ['Deposits', data.totals.count],
          ['Total', fmtMoney(data.totals.deposit)],
        ],
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

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>Term Deposit O/s as on</h2>
            <p className="muted">Which deposits were standing on a chosen day.</p>
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
            <button className="btn ghost" onClick={() => navigate('fd-list')}>
              Close
            </button>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <div className="frm">
            <Row label="Outstanding as on">
              <input type="date" value={f.asOn} onChange={set('asOn')} />
            </Row>
            <Row label="Scheme">
              <select value={f.scheme} onChange={set('scheme')}>
                <option value="">All schemes</option>
                {schemes.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Row>
          </div>

          {data && (
            <div className="chip-row" style={{ marginTop: 16 }}>
              <span className="badge neutral">{data.totals.count} deposits</span>
              <span className="badge neutral">₹{fmtMoney(data.totals.deposit)} held</span>
              <span className="badge neutral">maturing to ₹{fmtMoney(data.totals.maturity)}</span>
            </div>
          )}

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
                {loading && (
                  <tr>
                    <td colSpan={COLUMNS.length} className="muted" style={{ padding: 24, textAlign: 'center' }}>
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && data?.rows.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length} className="muted" style={{ padding: 24, textAlign: 'center' }}>
                      Nothing was standing on that day.
                    </td>
                  </tr>
                )}
                {!loading &&
                  data?.rows.map((r) => (
                    <tr key={r.id} className="row-link" onClick={() => navigate('fd-view', { id: r.id })}>
                      {COLUMNS.map((c) => (
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

/* ------------------------------------------------------------- fragments */

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  )
}

function Row({ label, req, span = 1, children }) {
  return (
    <>
      <label className="lbl">
        {label}
        {req && <span className="req"> *</span>}
      </label>
      <div className={`cell${span > 1 ? ` span-${span}` : ''}`}>{children}</div>
    </>
  )
}
