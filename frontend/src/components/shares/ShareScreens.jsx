import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate, fmtMoney } from '../../lib/format.js'
import { emitReport } from '../../lib/report.js'
import { company } from '../../company.js'

// The rest of the old Share menu: one holding in full, the certificate that
// covers it, the allotment report and the account statement.

const today = () => new Date().toISOString().slice(0, 10)
const startOfYear = () => `${new Date().getFullYear()}-01-01`

/* ------------------------------------------------------------ one holding */

export function ShareView({ navigate, id, session }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setData(await api.get(`/shares/${id}`))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (error && !data) return <div className="notice error">{error}</div>
  if (!data) return <div className="muted">Loading…</div>

  const { share, customer, transfers } = data
  const isAdmin = session?.user?.role === 'admin'

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>
              {share.accNo}{' '}
              <span className={`badge ${share.status === 'A' ? 'ok' : 'neutral'}`}>
                {share.status === 'A' ? 'Active' : 'Closed'}
              </span>
            </h2>
            <p className="muted">
              {share.customerName} · {share.custId}
              {customer?.mobile ? ` · ${customer.mobile}` : ''}
            </p>
          </div>
          <div className="master-head-right">
            {share.status === 'A' && (
              <>
                <button className="btn" onClick={() => navigate('share-certificate', { accNo: share.accNo })}>
                  Certificate
                </button>
                <button className="btn" onClick={() => navigate('share-transfer', { accNo: share.accNo })}>
                  Transfer
                </button>
              </>
            )}
            <button className="btn ghost" onClick={() => navigate('share-statement', { accNo: share.accNo })}>
              Statement
            </button>
            {isAdmin && transfers.length === 0 && (
              <button className="btn ghost" onClick={() => navigate('share-edit', { id: share.id })}>
                Edit
              </button>
            )}
            <button className="btn ghost" onClick={() => navigate('share-list')}>
              Close
            </button>
          </div>
        </header>

        <div className="master-body">
          <div className="stat-grid">
            <Stat label="Shares held" value={share.noOfShares} />
            <Stat label="Share value" value={fmtMoney(share.shareValue)} />
            <Stat label="Share amount" value={fmtMoney(share.shareAmount)} />
            <Stat
              label="Distinctive numbers"
              value={share.shareNoFrom ? `${share.shareNoFrom} – ${share.shareNoTo}` : '—'}
            />
          </div>

          <div className="frm" style={{ marginTop: 18 }}>
            <Row label="Share type">{share.schemeName || share.schemeCode || '—'}</Row>
            <Row label="Allotment date">{fmtDate(share.date)}</Row>
            <Row label="Certificate no">{share.certificateNo || '—'}</Row>
            <Row label="Duplicate no">{share.duplicateNo || '—'}</Row>
            <Row label="Entrance fees">{fmtMoney(share.entranceFees)}</Row>
            <Row label="Transaction">
              {share.transId} · {fmtDate(share.transDate)}
            </Row>
            <Row label="Nominee">
              {share.nominee?.name
                ? `${share.nominee.name}${share.nominee.relation ? ` (${share.nominee.relation})` : ''}`
                : '—'}
            </Row>
            <Row label="Transferee">{share.transferee || '— issued fresh'}</Row>
            {share.narration && (
              <Row label="Narration" span={3}>
                {share.narration}
              </Row>
            )}
          </div>

          <div className="frm-sep">
            <span>Transfers</span>
          </div>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Trans. Id</th>
                  <th style={{ width: 110 }}>Date</th>
                  <th>Moved</th>
                  <th style={{ width: 90 }} className="right-align">
                    Shares
                  </th>
                  <th style={{ width: 140 }} className="right-align">
                    Distinctive
                  </th>
                </tr>
              </thead>
              <tbody>
                {transfers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted" style={{ padding: 22, textAlign: 'center' }}>
                      Nothing has moved in or out.
                    </td>
                  </tr>
                )}
                {transfers.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{t.transId}</td>
                    <td>{fmtDate(t.transDate)}</td>
                    <td>
                      {t.fromAccNo === share.accNo
                        ? `Out to ${t.toCustId} / ${t.toCustomerName}`
                        : `In from ${t.fromCustId} / ${t.fromCustomerName}`}
                    </td>
                    <td className="right-align">{t.noOfShares}</td>
                    <td className="right-align mono">
                      {t.distFrom} – {t.distTo}
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

/* ----------------------------------------------------------- certificate */

export function ShareCertificate({ navigate, accNo: initialAccNo }) {
  const [accNo, setAccNo] = useState(initialAccNo || '')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const accRef = useRef(null)

  const load = useCallback(async (no) => {
    const v = String(no || '').trim()
    if (!v) return
    try {
      setData(await api.get(`/shares/${encodeURIComponent(v)}`))
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

  const s = data?.share
  const branch = data?.branch

  return (
    <div className="master">
      <div className="card">
        <header className="master-head no-print">
          <div>
            <h2>Share Certificate</h2>
            <p className="muted">{s ? `${s.accNo} · ${s.customerName}` : 'Find the holding to print'}</p>
          </div>
          <div className="master-head-right">
            <button className="btn" onClick={() => window.print()} disabled={!s}>
              Print
            </button>
            <button className="btn ghost" onClick={() => navigate('share-list')}>
              Close
            </button>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error no-print">{error}</div>}

          <form
            className="frm no-print"
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
                  placeholder="201100123"
                />
                <button type="submit" className="btn ghost">
                  Go
                </button>
              </div>
            </Row>
          </form>

          {s && (
            <div className="certificate">
              <div className="cert-head">
                <img src={company.logo} alt="" className="cert-logo" />
                <div>
                  <h1>{branch?.companyName || company.name}</h1>
                  <p>
                    {[branch?.address, branch?.city, branch?.pincode].filter(Boolean).join(', ')}
                  </p>
                </div>
              </div>

              <h2 className="cert-title">Share Certificate</h2>

              <table className="cert-grid">
                <tbody>
                  <tr>
                    <th>Certificate No</th>
                    <td className="mono">{s.certificateNo || '—'}</td>
                    <th>Account No</th>
                    <td className="mono">{s.accNo}</td>
                  </tr>
                  <tr>
                    <th>Member</th>
                    <td colSpan={3}>
                      {s.custId} / {s.customerName}
                    </td>
                  </tr>
                  <tr>
                    <th>Share Type</th>
                    <td>{s.schemeName || s.schemeCode || '—'}</td>
                    <th>Allotment Date</th>
                    <td>{fmtDate(s.date)}</td>
                  </tr>
                  <tr>
                    <th>No. of Shares</th>
                    <td>{s.noOfShares}</td>
                    <th>Share Value</th>
                    <td>{fmtMoney(s.shareValue)}</td>
                  </tr>
                  <tr>
                    <th>Distinctive Nos.</th>
                    <td className="mono">
                      {s.shareNoFrom} to {s.shareNoTo}
                    </td>
                    <th>Share Amount</th>
                    <td>{fmtMoney(s.shareAmount)}</td>
                  </tr>
                  <tr>
                    <th>Nominee</th>
                    <td colSpan={3}>
                      {s.nominee?.name
                        ? `${s.nominee.name}${s.nominee.relation ? ` (${s.nominee.relation})` : ''}`
                        : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>

              <p className="cert-words">
                This is to certify that the member named above is the registered holder of{' '}
                <strong>{s.noOfShares}</strong> share{s.noOfShares === 1 ? '' : 's'} of{' '}
                <strong>{fmtMoney(s.shareValue)}</strong> each, fully paid, bearing the distinctive numbers above.
              </p>

              <div className="cert-signs">
                <span>Secretary</span>
                <span>President</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------ allotment report */

export function ShareAllotmentReport({ navigate }) {
  const [f, setF] = useState({ from: startOfYear(), to: today(), custId: '', view: 'allotment' })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [format, setFormat] = useState('PDF')

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  useEffect(() => {
    let dead = false
    setLoading(true)
    const path =
      f.view === 'register'
        ? '/shares/reports/register?status=A'
        : `/shares/reports/allotment?from=${f.from}&to=${f.to}&custId=${encodeURIComponent(f.custId)}`
    api
      .get(path)
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

  const COLUMNS = [
    { key: 'accNo', label: 'Account No' },
    { key: 'customerName', label: 'Customer Name' },
    { key: 'date', label: 'Date', value: (r) => fmtDate(r.date) },
    { key: 'noOfShares', label: 'Shares', align: 'right' },
    { key: 'shareValue', label: 'Value', align: 'right', value: (r) => fmtMoney(r.shareValue) },
    { key: 'shareAmount', label: 'Share Amt', align: 'right', value: (r) => fmtMoney(r.shareAmount) },
    { key: 'shareNoFrom', label: 'From No.', align: 'right' },
    { key: 'shareNoTo', label: 'To No.', align: 'right' },
    { key: 'certificateNo', label: 'Certificate No' },
  ]

  async function exportIt() {
    if (!data) return
    try {
      await emitReport(format, {
        title: f.view === 'register' ? 'Share Register' : 'Share Allotment Report',
        fileName: f.view === 'register' ? 'Share_Register' : 'Share_Allotment_Report',
        branch: data.branch,
        meta:
          f.view === 'register'
            ? [['Holdings', data.totals.count]]
            : [
                ['From Date', fmtDate(f.from)],
                ['To Date', fmtDate(f.to)],
                ['Cust. Id', f.custId],
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
            <h2>{f.view === 'register' ? 'Share Register' : 'Share Allotment Report'}</h2>
            <p className="muted">
              {f.view === 'register'
                ? 'Every live holding, in distinctive-number order.'
                : 'What was allotted between two dates.'}
            </p>
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
            <button className="btn ghost" onClick={() => navigate('share-list')}>
              Close
            </button>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <div className="frm">
            <Row label="Report">
              <select value={f.view} onChange={set('view')}>
                <option value="allotment">Share Allotment</option>
                <option value="register">Share Register</option>
              </select>
            </Row>
            <Row label="Cust. Id">
              <input
                className="mono"
                value={f.custId}
                onChange={set('custId')}
                disabled={f.view === 'register'}
                placeholder="All members"
              />
            </Row>
            <Row label="From Date">
              <input type="date" value={f.from} onChange={set('from')} disabled={f.view === 'register'} />
            </Row>
            <Row label="To Date">
              <input type="date" value={f.to} onChange={set('to')} disabled={f.view === 'register'} />
            </Row>
          </div>

          {data && (
            <div className="chip-row" style={{ marginTop: 14 }}>
              <span className="badge neutral">{data.totals.count} holdings</span>
              <span className="badge neutral">{data.totals.shares} shares</span>
              <span className="badge neutral">₹{fmtMoney(data.totals.amount)}</span>
              {data.totals.entranceFees > 0 && (
                <span className="badge neutral">entrance ₹{fmtMoney(data.totals.entranceFees)}</span>
              )}
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
                      Nothing matches those filters.
                    </td>
                  </tr>
                )}
                {!loading &&
                  data?.rows.map((r) => (
                    <tr key={r.id} className="row-link" onClick={() => navigate('share-view', { id: r.id })}>
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

/* ------------------------------------------------------ account statement */

export function ShareStatement({ navigate, accNo: initialAccNo }) {
  const [accNo, setAccNo] = useState(initialAccNo || '')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [format, setFormat] = useState('PDF')
  const accRef = useRef(null)

  const load = useCallback(async (no) => {
    const v = String(no || '').trim()
    if (!v) return
    try {
      setData(await api.get(`/shares/${encodeURIComponent(v)}/statement`))
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
        title: 'Share Account Statement',
        fileName: `Share_Statement_${data.share.accNo}`,
        branch: data.branch,
        meta: [
          ['Account No', data.share.accNo],
          ['Member', `${data.share.custId} / ${data.share.customerName}`],
          ['Shares held', data.totals.held],
          ['Share amount', fmtMoney(data.totals.amount)],
        ],
        columns: [
          { label: 'Date', value: (r) => fmtDate(r.date) },
          { label: 'Trans. Id', value: (r) => r.transId },
          { label: 'Particulars', value: (r) => r.particulars },
          { label: 'In', align: 'right', value: (r) => r.inShares || '' },
          { label: 'Out', align: 'right', value: (r) => r.outShares || '' },
          { label: 'Held', align: 'right', value: (r) => r.held },
        ],
        rows: data.lines,
      })
    } catch (e) {
      setError(e.message)
    }
  }

  const s = data?.share

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>Account Statement</h2>
            <p className="muted">{s ? `${s.accNo} · ${s.customerName}` : 'One share holding, from allotment on'}</p>
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
            <button className="btn ghost" onClick={() => navigate('share-list')}>
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
                  placeholder="201100123"
                />
                <button type="submit" className="btn ghost">
                  Go
                </button>
              </div>
            </Row>
            <Row label="Member">
              <input value={s ? `${s.custId} / ${s.customerName}` : ''} readOnly />
            </Row>
          </form>

          {data && (
            <>
              <div className="stat-grid" style={{ marginTop: 18 }}>
                <Stat label="Shares held" value={data.totals.held} />
                <Stat label="Share amount" value={fmtMoney(data.totals.amount)} />
                <Stat
                  label="Distinctive numbers"
                  value={s.shareNoFrom ? `${s.shareNoFrom} – ${s.shareNoTo}` : '—'}
                />
                <Stat label="Certificate" value={s.certificateNo || '—'} />
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
                      <th className="right-align">Held</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((l, i) => (
                      <tr key={i}>
                        <td>{fmtDate(l.date)}</td>
                        <td className="mono">{l.transId || '—'}</td>
                        <td>{l.particulars}</td>
                        <td className="right-align">{l.inShares || ''}</td>
                        <td className="right-align">{l.outShares || ''}</td>
                        <td className="right-align">
                          <strong>{l.held}</strong>
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
