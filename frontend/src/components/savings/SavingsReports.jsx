import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate, fmtMoney } from '../../lib/format.js'
import { emitReport } from '../../lib/report.js'

// The rest of the old Savings menu: the half-yearly interest run, the
// passbook, the filtered report and the outstanding list.

const today = () => new Date().toISOString().slice(0, 10)
const n = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? 0 : Number(v))
// A half-year is how this interest has always been reckoned, so the screen
// opens on the one that has just finished.
function lastHalfYear() {
  const now = new Date()
  const firstHalf = now.getMonth() < 6
  return firstHalf
    ? { from: `${now.getFullYear() - 1}-10-01`, to: `${now.getFullYear() - 1}-12-31` }
    : { from: `${now.getFullYear()}-04-01`, to: `${now.getFullYear()}-09-30` }
}

/* --------------------------------------------------- half-yearly product */

export function SavingsProduct({ navigate, session }) {
  const half = lastHalfYear()
  const [f, setF] = useState({ from: half.from, to: half.to, scheme: '', glCode: '' })
  const [schemes, setSchemes] = useState([])
  const [glAccounts, setGlAccounts] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [posted, setPosted] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [format, setFormat] = useState('Excel')

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const isAdmin = session?.user?.role === 'admin'

  useEffect(() => {
    api
      .get('/savings/new')
      .then((d) => {
        setSchemes(d.schemes)
        setGlAccounts(d.glAccounts)
        setF((s) => ({ ...s, glCode: s.glCode || d.glAccounts[0]?.code || '' }))
      })
      .catch(() => {})
  }, [])

  async function preview(e) {
    e?.preventDefault()
    setLoading(true)
    setError('')
    setPosted(null)
    try {
      const qs = new URLSearchParams({ from: f.from, to: f.to, scheme: f.scheme })
      setData(await api.get(`/savings/product/preview?${qs}`))
    } catch (e2) {
      setError(e2.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  async function postIt() {
    setConfirming(false)
    setLoading(true)
    setError('')
    try {
      const r = await api.post('/savings/product/post', {
        from: f.from,
        to: f.to,
        scheme: f.scheme,
        glCode: f.glCode,
      })
      setPosted(r)
      setData(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function exportIt() {
    if (!data) return
    try {
      await emitReport(format, {
        title: 'Savings Interest Product',
        fileName: 'Savings_Interest_Product',
        branch: data.branch,
        meta: [
          ['From Date', fmtDate(data.from)],
          ['To Date', fmtDate(data.to)],
          ['Accounts', data.totals.count],
          ['Interest', fmtMoney(data.totals.interest)],
        ],
        columns: [
          { label: 'Account No', value: (r) => r.accNo },
          { label: 'Customer Name', value: (r) => r.customerName },
          { label: 'Opening', align: 'right', value: (r) => fmtMoney(r.opening) },
          { label: 'Closing', align: 'right', value: (r) => fmtMoney(r.closing) },
          { label: 'Product', align: 'right', value: (r) => fmtMoney(r.product) },
          { label: 'ROI', align: 'right', value: (r) => r.interestRate },
          { label: 'Interest', align: 'right', value: (r) => fmtMoney(r.interest) },
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
            <h2>Half-yearly Product</h2>
            <p className="muted">
              Interest on the balance standing each day, worked out first and posted only when you say so.
            </p>
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
            <button className="btn ghost" onClick={() => navigate('sb-list')}>
              Close
            </button>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}
          {posted && (
            <div className="notice success">
              Interest posted to {posted.posted} account{posted.posted === 1 ? '' : 's'}, {fmtMoney(posted.total)} in
              all.
              {posted.skipped > 0 && ` ${posted.skipped} were already paid up to that date and were left alone.`}
            </div>
          )}

          <form className="frm" onSubmit={preview}>
            <Row label="Interest From" req>
              <input type="date" value={f.from} onChange={set('from')} required />
            </Row>
            <Row label="Interest Upto" req>
              <input type="date" value={f.to} onChange={set('to')} required />
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
            <Row label="Posted through">
              <select value={f.glCode} onChange={set('glCode')}>
                {glAccounts.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Row>

            <Row label=" " span={3}>
              <div className="check-row">
                <button className="btn primary" type="submit" disabled={loading}>
                  {loading ? 'Working…' : 'Go'}
                </button>
                {data && data.rows.length > 0 && isAdmin && (
                  <button type="button" className="btn" onClick={() => setConfirming(true)} disabled={loading}>
                    Transact
                  </button>
                )}
                {data && data.rows.length > 0 && !isAdmin && (
                  <span className="muted">Only an admin can post the interest.</span>
                )}
              </div>
            </Row>
          </form>

          {data && (
            <>
              <div className="chip-row" style={{ marginTop: 16 }}>
                <span className="badge neutral">{data.totals.count} accounts</span>
                <span className="badge neutral">product ₹{fmtMoney(data.totals.product)}</span>
                <span className="badge ok">interest ₹{fmtMoney(data.totals.interest)}</span>
              </div>

              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="grid">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Account No</th>
                      <th>Customer Name</th>
                      <th className="right-align">Opening</th>
                      <th className="right-align">Closing</th>
                      <th className="right-align">Product</th>
                      <th className="right-align">ROI</th>
                      <th className="right-align">Interest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="muted" style={{ padding: 24, textAlign: 'center' }}>
                          No account earned anything over that period.
                        </td>
                      </tr>
                    )}
                    {data.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="mono">{r.accNo}</td>
                        <td className="clamp">{r.customerName}</td>
                        <td className="right-align">{fmtMoney(r.opening)}</td>
                        <td className="right-align">{fmtMoney(r.closing)}</td>
                        <td className="right-align">{fmtMoney(r.product)}</td>
                        <td className="right-align">{r.interestRate}</td>
                        <td className="right-align">
                          <strong>{fmtMoney(r.interest)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {confirming && (
        <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setConfirming(false)}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-head">Post the interest</div>
            <div className="modal-body">
              <p style={{ marginTop: 0 }}>
                {fmtMoney(data.totals.interest)} will be credited across {data.totals.count} account
                {data.totals.count === 1 ? '' : 's'}, dated {fmtDate(data.to)}.
              </p>
              <p className="muted" style={{ marginBottom: 0 }}>
                An account already paid up to that date is left alone, so running this twice does not pay twice.
                Each credit is an ordinary transaction and can be cancelled one by one.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setConfirming(false)}>
                Not yet
              </button>
              <button className="btn primary" onClick={postIt}>
                Post it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- passbook */

export function SavingsStatement({ navigate, accNo: initialAccNo }) {
  const [accNo, setAccNo] = useState(initialAccNo || '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(today())
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [format, setFormat] = useState('PDF')
  const accRef = useRef(null)

  const load = useCallback(
    async (no) => {
      const v = String(no || '').trim()
      if (!v) return
      try {
        const qs = new URLSearchParams({ from, to })
        setData(await api.get(`/savings/${encodeURIComponent(v)}/statement?${qs}`))
        setError('')
      } catch (e) {
        setData(null)
        setError(e.message)
      }
    },
    [from, to]
  )

  useEffect(() => {
    if (initialAccNo) load(initialAccNo)
    else accRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAccNo])

  async function exportIt() {
    if (!data) return
    try {
      await emitReport(format, {
        title: 'Savings Account Statement',
        fileName: `SB_Statement_${data.account.accNo}`,
        branch: data.branch,
        meta: [
          ['Account No', data.account.accNo],
          ['Customer', `${data.account.custId} / ${data.account.customerName}`],
          ['Period', `${fmtDate(data.from) || 'the beginning'} to ${fmtDate(data.to)}`],
          ['Opening Balance', fmtMoney(data.opening)],
          ['Closing Balance', fmtMoney(data.totals.closing)],
        ],
        columns: [
          { label: 'Date', value: (r) => fmtDate(r.transDate) },
          { label: 'Trans. Id', value: (r) => r.transId },
          { label: 'Particulars', value: (r) => r.particulars },
          { label: 'Deposit', align: 'right', value: (r) => (r.credit ? fmtMoney(r.credit) : '') },
          { label: 'Withdrawal', align: 'right', value: (r) => (r.debit ? fmtMoney(r.debit) : '') },
          { label: 'Balance', align: 'right', value: (r) => fmtMoney(r.balance) },
        ],
        rows: data.lines,
      })
    } catch (e) {
      setError(e.message)
    }
  }

  const a = data?.account

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>Account Statement</h2>
            <p className="muted">{a ? `${a.accNo} · ${a.customerName}` : 'One savings account, as a passbook'}</p>
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
            <button className="btn ghost" onClick={() => navigate('sb-list')}>
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
                  placeholder="201200209"
                />
                <button type="submit" className="btn ghost">
                  Go
                </button>
              </div>
            </Row>
            <Row label="Customer">
              <input value={a ? `${a.custId} / ${a.customerName}` : ''} readOnly />
            </Row>
            <Row label="From Date">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Row>
            <Row label="To Date">
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Row>
          </form>

          {data && (
            <>
              <div className="stat-grid" style={{ marginTop: 18 }}>
                <Stat label="Opening balance" value={fmtMoney(data.opening)} />
                <Stat label="Deposits" value={fmtMoney(data.totals.credit)} />
                <Stat label="Withdrawals" value={fmtMoney(data.totals.debit)} />
                <Stat label="Closing balance" value={fmtMoney(data.totals.closing)} />
              </div>

              <div className="table-wrap" style={{ marginTop: 16 }}>
                <table className="grid">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Date</th>
                      <th style={{ width: 100 }}>Trans. Id</th>
                      <th>Particulars</th>
                      <th className="right-align">Deposit</th>
                      <th className="right-align">Withdrawal</th>
                      <th className="right-align">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={5} className="muted">
                        Opening balance{data.from ? ` on ${fmtDate(data.from)}` : ''}
                      </td>
                      <td className="right-align">
                        <strong>{fmtMoney(data.opening)}</strong>
                      </td>
                    </tr>
                    {data.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{fmtDate(l.transDate)}</td>
                        <td className="mono">{l.transId || '—'}</td>
                        <td className="clamp">{l.particulars}</td>
                        <td className="right-align">{l.credit ? fmtMoney(l.credit) : ''}</td>
                        <td className="right-align">{l.debit ? fmtMoney(l.debit) : ''}</td>
                        <td className="right-align">{fmtMoney(l.balance)}</td>
                      </tr>
                    ))}
                    {data.lines.length === 0 && (
                      <tr>
                        <td colSpan={6} className="muted" style={{ padding: 22, textAlign: 'center' }}>
                          Nothing moved in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={3}>Total</th>
                      <th className="right-align">{fmtMoney(data.totals.credit)}</th>
                      <th className="right-align">{fmtMoney(data.totals.debit)}</th>
                      <th className="right-align">{fmtMoney(data.totals.closing)}</th>
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

/* ------------------------------------------------- reports and O/s as on */

const CONDITIONS = [
  { value: '', label: 'is any value' },
  { value: '>', label: 'is greater than' },
  { value: '>=', label: 'is greater than or equal to' },
  { value: 'between', label: 'is between' },
  { value: '<', label: 'is less than' },
  { value: '<=', label: 'is less than or equal to' },
]

const LIST_COLUMNS = [
  { key: 'accNo', label: 'Account No' },
  { key: 'customerName', label: 'Customer Name' },
  { key: 'custId', label: 'Customer Id' },
  { key: 'openDate', label: 'Open Date', value: (r) => fmtDate(r.openDate) },
  { key: 'lastTranDate', label: 'Last Tran Dt', value: (r) => (r.lastTranDate ? fmtDate(r.lastTranDate) : '—') },
  { key: 'status', label: 'Status' },
  { key: 'balance', label: 'Cl. Bal', align: 'right', value: (r) => fmtMoney(r.balance) },
]

export function SavingsReportsScreen({ navigate }) {
  const [f, setF] = useState({
    scheme: '', active: true, closed: false,
    accFrom: '', accTo: '', openFrom: '', openTo: '',
    balCond: '', balV1: '', balV2: '',
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
      .get('/savings/new')
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
      setData(await api.get(`/savings/reports/list?${qs}`))
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
        title: 'Savings Report',
        fileName: 'Savings_Report',
        branch: data.branch,
        meta: [
          ['Scheme', f.scheme || 'All'],
          ['A/c Status', [f.active && 'Active', f.closed && 'Closed'].filter(Boolean).join(', ') || 'None'],
          ['A/c No.', [f.accFrom, f.accTo].filter(Boolean).join(' to ')],
          ['Open Date', [f.openFrom, f.openTo].filter(Boolean).map(fmtDate).join(' to ')],
          ['Accounts', data.totals.count],
          ['Total balance', fmtMoney(data.totals.balance)],
        ],
        columns: LIST_COLUMNS.map((c) => ({
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
            <h2>Savings Reports</h2>
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
            <button className="btn ghost" onClick={() => navigate('sb-list')}>
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

            <Row label="Closing Balance" span={3}>
              <div className="check-row">
                <select value={f.balCond} onChange={set('balCond')} style={{ maxWidth: 260 }}>
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {f.balCond && (
                  <input
                    type="number"
                    step="0.01"
                    value={f.balV1}
                    onChange={set('balV1')}
                    style={{ maxWidth: 160 }}
                    placeholder="value"
                  />
                )}
                {f.balCond === 'between' && (
                  <>
                    <span className="muted">and</span>
                    <input
                      type="number"
                      step="0.01"
                      value={f.balV2}
                      onChange={set('balV2')}
                      style={{ maxWidth: 160 }}
                      placeholder="value"
                    />
                  </>
                )}
              </div>
            </Row>

            <Row label=" " span={3}>
              <button className="btn primary" type="submit" disabled={loading}>
                {loading ? 'Working…' : 'Report'}
              </button>
            </Row>
          </form>

          {data && <ResultTable data={data} navigate={navigate} loading={loading} />}
        </div>
      </div>
    </div>
  )
}

export function SavingsOutstanding({ navigate }) {
  const [f, setF] = useState({ asOn: today(), scheme: '' })
  const [schemes, setSchemes] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [format, setFormat] = useState('PDF')

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  useEffect(() => {
    api
      .get('/savings/new')
      .then((d) => setSchemes(d.schemes))
      .catch(() => {})
  }, [])

  useEffect(() => {
    let dead = false
    setLoading(true)
    api
      .get(`/savings/reports/outstanding?asOn=${f.asOn}&scheme=${f.scheme}`)
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
        title: 'Savings O/s as on',
        fileName: 'Savings_Outstanding',
        branch: data.branch,
        meta: [
          ['Outstanding as on', fmtDate(data.asOn)],
          ['Scheme', f.scheme || 'All'],
          ['Accounts', data.totals.count],
          ['Total', fmtMoney(data.totals.balance)],
        ],
        columns: LIST_COLUMNS.map((c) => ({
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
            <h2>Savings O/s as on</h2>
            <p className="muted">What each account held on a chosen day.</p>
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
            <button className="btn ghost" onClick={() => navigate('sb-list')}>
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

          {data && <ResultTable data={data} navigate={navigate} loading={loading} />}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- fragments */

function ResultTable({ data, navigate, loading }) {
  return (
    <>
      <div className="chip-row" style={{ marginTop: 16 }}>
        <span className="badge neutral">{data.totals.count} accounts</span>
        <span className="badge neutral">₹{fmtMoney(data.totals.balance)}</span>
      </div>
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table className="grid">
          <thead>
            <tr>
              {LIST_COLUMNS.map((c) => (
                <th key={c.key} className={c.align === 'right' ? 'right-align' : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={LIST_COLUMNS.length} className="muted" style={{ padding: 24, textAlign: 'center' }}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && data.rows.length === 0 && (
              <tr>
                <td colSpan={LIST_COLUMNS.length} className="muted" style={{ padding: 24, textAlign: 'center' }}>
                  Nothing matches those filters.
                </td>
              </tr>
            )}
            {!loading &&
              data.rows.map((r) => (
                <tr key={r.id} className="row-link" onClick={() => navigate('sb-view', { id: r.id })}>
                  {LIST_COLUMNS.map((c) => (
                    <td key={c.key} className={c.align === 'right' ? 'right-align' : undefined}>
                      {c.value ? c.value(r) : (r[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

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
