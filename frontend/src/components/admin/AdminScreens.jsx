import { Fragment, useCallback, useEffect, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate, fmtMoney } from '../../lib/format.js'
import { emitReport } from '../../lib/report.js'

// The Admin side of the old app. Every screen here is a different cut of one
// day book, which the server works out from the product modules rather than
// from a postings table — the books taken over from the old system were never
// posted through this app, so there is nothing stored to read.

const today = () => new Date().toISOString().slice(0, 10)
const CLOSE_TO = 'dashboard'

/* --------------------------------------------------------------- the pieces */

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

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  )
}

// A report that cannot place every leg says so here, once, with the screen
// that would fix it. Better a report that admits a hole than one that looks
// whole.
function GapNote({ note }) {
  if (!note || (note.pending.length === 0 && note.unbalanced === 0)) return null
  return (
    <div className="notice" style={{ marginTop: 12 }}>
      {note.unbalanced > 0 && (
        <p>
          <strong>{note.unbalanced}</strong> entr{note.unbalanced === 1 ? 'y' : 'ies'} in this window do not have two
          equal sides. That is a fault, not a rounding slip — please report it.
        </p>
      )}
      {note.pending.length > 0 && (
        <>
          <p>Part of this window has no ledger head to post to yet:</p>
          <ul style={{ margin: '8px 0 0 18px' }}>
            {note.pending.map((p) => (
              <li key={p.kind}>
                <strong>{p.label}</strong> — {fmtMoney(p.amount)} over {p.count} posting
                {p.count === 1 ? '' : 's'}
                {p.fix ? ` · set it in ${p.fix}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function Toolbar({ format, setFormat, onExport, canExport, navigate }) {
  return (
    <div className="master-head-right">
      <select value={format} onChange={(e) => setFormat(e.target.value)} aria-label="File type">
        <option>Excel</option>
        <option>PDF</option>
        <option>Word</option>
      </select>
      <button className="btn" onClick={onExport} disabled={!canExport}>
        Export
      </button>
      <button className="btn ghost" onClick={() => navigate(CLOSE_TO)}>
        Close
      </button>
    </div>
  )
}

// Every screen here loads the same way: set the filters, press Go.
function useReport() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const run = useCallback(
    async (path) => {
      setLoading(true)
      setError('')
      try {
        setData(await api.get(path))
      } catch (e) {
        setError(e.message)
        setData(null)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  return { data, error, loading, run, setError }
}

// The GL heads, for every picker on these screens.
function useHeads() {
  const [heads, setHeads] = useState([])
  const [sources, setSources] = useState([])
  useEffect(() => {
    api
      .get('/admin/heads')
      .then((d) => {
        setHeads(d.glAccounts)
        setSources(d.sources)
      })
      .catch(() => {})
  }, [])
  return { heads, sources }
}

/* -------------------------------------------------------- view transactions */

export function ViewTransactions({ navigate }) {
  const { sources } = useHeads()
  const [f, setF] = useState({ from: today(), to: today(), source: '', q: '', accNo: '', status: '' })
  const [format, setFormat] = useState('Excel')
  const [open, setOpen] = useState(null)
  const { data, error, loading, run } = useReport()
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  const query = useCallback(
    (page = 1) =>
      `/admin/transactions?${new URLSearchParams({
        from: f.from,
        to: f.to,
        ...(f.source ? { source: f.source } : {}),
        ...(f.q ? { q: f.q } : {}),
        ...(f.accNo ? { accNo: f.accNo } : {}),
        ...(f.status ? { status: f.status } : {}),
        page: String(page),
      })}`,
    [f]
  )

  useEffect(() => {
    run(query(1))
    // The day's own work is what this screen is for, so it opens on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function go(e) {
    e.preventDefault()
    setOpen(null)
    run(query(1))
  }

  async function exportIt() {
    if (!data) return
    await emitReport(format, {
      title: 'View Transactions',
      fileName: 'View_Transactions',
      branch: data.branch,
      meta: [
        ['From Date', fmtDate(data.from)],
        ['To Date', fmtDate(data.to)],
        ['Transactions', data.totals.count],
        ['Amount', fmtMoney(data.totals.amount)],
      ],
      columns: [
        { label: 'Tran. Id', value: (r) => r.transId },
        { label: 'Tran. Date', value: (r) => fmtDate(r.date) },
        { label: 'Particulars', value: (r) => r.particulars },
        { label: 'Book', value: (r) => r.source },
        { label: 'Tran. Amount', align: 'right', value: (r) => fmtMoney(r.amount) },
        { label: 'Creat. By', value: (r) => r.createdByName || '' },
        { label: 'Status', value: (r) => (r.status === 'A' ? '' : r.status) },
      ],
      rows: data.transactions,
    })
  }

  const pages = data ? Math.ceil(data.total / data.limit) : 0

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>View Transactions</h2>
            <p className="muted">Everything that moved in the branch, with the ledger heads each entry touched</p>
          </div>
          <Toolbar
            format={format}
            setFormat={setFormat}
            onExport={exportIt}
            canExport={!!data && !loading}
            navigate={navigate}
          />
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <form className="frm" onSubmit={go}>
            <Row label="From Date" req>
              <input type="date" value={f.from} onChange={set('from')} required />
            </Row>
            <Row label="To Date" req>
              <input type="date" value={f.to} onChange={set('to')} required />
            </Row>

            <Row label="Book">
              <select value={f.source} onChange={set('source')}>
                <option value="">Every book</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Status">
              <select value={f.status} onChange={set('status')}>
                <option value="">All</option>
                <option value="A">Standing</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Row>

            <Row label="Tran. Id / Particulars">
              <input value={f.q} onChange={set('q')} placeholder="16610001 or a name" />
            </Row>
            <Row label="Account No">
              <input className="mono" value={f.accNo} onChange={set('accNo')} placeholder="201600366" />
            </Row>

            <Row label=" " span={3}>
              <button className="btn primary" type="submit" disabled={loading}>
                {loading ? 'Working…' : 'View'}
              </button>
            </Row>
          </form>

          {data && (
            <>
              <div className="stat-grid" style={{ marginTop: 18 }}>
                <Stat label="Transactions" value={data.totals.count} />
                <Stat label="Amount" value={fmtMoney(data.totals.amount)} />
                <Stat label="Cancelled" value={data.totals.cancelled} />
              </div>

              <GapNote note={data.note} />

              <div className="table-wrap" style={{ marginTop: 18 }}>
                <table className="grid">
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>Tran. Id</th>
                      <th style={{ width: 110 }}>Tran. Date</th>
                      <th>Particulars</th>
                      <th style={{ width: 120 }}>Book</th>
                      <th className="right-align" style={{ width: 130 }}>
                        Tran. Amount
                      </th>
                      <th style={{ width: 110 }}>Creat. By</th>
                      <th style={{ width: 90 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.length === 0 && (
                      <tr>
                        <td colSpan={7} className="muted" style={{ padding: 22, textAlign: 'center' }}>
                          Nothing moved in this window.
                        </td>
                      </tr>
                    )}
                    {data.transactions.map((e) => {
                      const key = `${e.source}:${e.refId}`
                      return (
                        <ExpandingRow
                          key={key}
                          entry={e}
                          open={open === key}
                          onToggle={() => setOpen(open === key ? null : key)}
                        />
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {pages > 1 && (
                <div className="check-row" style={{ marginTop: 14 }}>
                  <button
                    className="btn tiny ghost"
                    disabled={data.page <= 1 || loading}
                    onClick={() => run(query(data.page - 1))}
                  >
                    Previous
                  </button>
                  <span className="muted">
                    Page {data.page} of {pages}
                  </span>
                  <button
                    className="btn tiny ghost"
                    disabled={data.page >= pages || loading}
                    onClick={() => run(query(data.page + 1))}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// One transaction, and underneath it the ledger heads it touched — the old
// screen's "GL Postings" popup, in place.
function ExpandingRow({ entry, open, onToggle }) {
  const dim = entry.status !== 'A' ? { opacity: 0.55 } : undefined
  return (
    <>
      <tr style={dim}>
        <td className="mono">{entry.transId || '—'}</td>
        <td>{fmtDate(entry.date)}</td>
        <td>
          {entry.particulars}
          {entry.status !== 'A' && <small className="muted"> · {entry.status}</small>}
          {!entry.balanced && <small className="muted"> · sides do not agree</small>}
        </td>
        <td>{entry.source}</td>
        <td className="right-align">{fmtMoney(entry.amount)}</td>
        <td>{entry.createdByName || '—'}</td>
        <td className="right-align">
          <button type="button" className="btn tiny ghost" onClick={onToggle}>
            {open ? 'Hide' : 'View'}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} style={{ background: 'var(--surface-2)' }}>
            {entry.postings.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Nothing moved between ledger heads — this entry only changed whose name the holding is in.
              </p>
            ) : (
              <table className="grid" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Code</th>
                    <th>Ledger Head</th>
                    <th style={{ width: 160 }}>For</th>
                    <th className="right-align" style={{ width: 130 }}>
                      Debit
                    </th>
                    <th className="right-align" style={{ width: 130 }}>
                      Credit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entry.postings.map((p, i) => (
                    <tr key={i}>
                      <td className="mono">{p.glCode || '—'}</td>
                      <td>
                        {p.glName}
                        {p.pending && <small className="muted"> · no head set</small>}
                      </td>
                      <td>{p.label}</td>
                      <td className="right-align">{p.dr ? fmtMoney(p.dr) : ''}</td>
                      <td className="right-align">{p.cr ? fmtMoney(p.cr) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={3}>Total</th>
                    <th className="right-align">{fmtMoney(entry.totalDr)}</th>
                    <th className="right-align">{fmtMoney(entry.totalCr)}</th>
                  </tr>
                </tfoot>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- cash book */

export function CashBook({ navigate }) {
  const { heads } = useHeads()
  const [f, setF] = useState({ from: today(), to: today(), glCode: '' })
  const [format, setFormat] = useState('Excel')
  const [open, setOpen] = useState(null)
  const { data, error, loading, run } = useReport()
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  // The till and the bank accounts are the only heads a cash book is run on.
  const tills = heads.filter((g) => g.isBankAccount || /cash on hand/i.test(g.name))

  useEffect(() => {
    run(`/admin/cash-book?from=${today()}&to=${today()}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function go(e) {
    e.preventDefault()
    setOpen(null)
    run(
      `/admin/cash-book?${new URLSearchParams({
        from: f.from,
        to: f.to,
        ...(f.glCode ? { glCode: f.glCode } : {}),
      })}`
    )
  }

  async function exportIt() {
    if (!data) return
    await emitReport(format, {
      title: `Cash Book — ${data.head.name}`,
      fileName: 'Cash_Book',
      branch: data.branch,
      meta: [
        ['From Date', fmtDate(data.from)],
        ['To Date', fmtDate(data.to)],
        ['Opening Balance', fmtMoney(data.opening)],
        ['Closing Balance', fmtMoney(data.closing)],
      ],
      columns: [
        { label: 'Date', value: (r) => fmtDate(r.date) },
        { label: 'Opening', align: 'right', value: (r) => fmtMoney(r.opening) },
        { label: 'Receipts', align: 'right', value: (r) => fmtMoney(r.receipts) },
        { label: 'Payments', align: 'right', value: (r) => fmtMoney(r.payments) },
        { label: 'Closing', align: 'right', value: (r) => fmtMoney(r.closing) },
      ],
      rows: data.days,
    })
  }

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>Cash Book</h2>
            <p className="muted">
              {data ? `${data.head.code} · ${data.head.name}` : 'What the till opened on, took in, paid out and closed on'}
            </p>
          </div>
          <Toolbar
            format={format}
            setFormat={setFormat}
            onExport={exportIt}
            canExport={!!data && !loading}
            navigate={navigate}
          />
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <form className="frm" onSubmit={go}>
            <Row label="From Date" req>
              <input type="date" value={f.from} onChange={set('from')} required />
            </Row>
            <Row label="To Date" req>
              <input type="date" value={f.to} onChange={set('to')} required />
            </Row>

            <Row label="Account">
              <select value={f.glCode} onChange={set('glCode')}>
                <option value="">Cash on Hand</option>
                {tills.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.code} · {g.name}
                  </option>
                ))}
              </select>
            </Row>
            <Row label=" ">
              <button className="btn primary" type="submit" disabled={loading}>
                {loading ? 'Working…' : 'View'}
              </button>
            </Row>
          </form>

          {data && (
            <>
              <div className="stat-grid" style={{ marginTop: 18 }}>
                <Stat label="Opening" value={fmtMoney(data.opening)} />
                <Stat label="Receipts" value={fmtMoney(data.totals.receipts)} />
                <Stat label="Payments" value={fmtMoney(data.totals.payments)} />
                <Stat label="Closing" value={fmtMoney(data.closing)} />
              </div>

              {data.openingSource === 'none' && (
                <div className="notice" style={{ marginTop: 12 }}>
                  This head has no opening balance on record, so the book starts from nothing rather than from what
                  the old system closed on. Enter it under <strong>Settings → GL Opening Balance</strong>.
                </div>
              )}

              <GapNote note={data.note} />

              <div className="table-wrap" style={{ marginTop: 18 }}>
                <table className="grid">
                  <thead>
                    <tr>
                      <th style={{ width: 120 }}>Date</th>
                      <th className="right-align">Opening</th>
                      <th className="right-align">Receipts</th>
                      <th className="right-align">Payments</th>
                      <th className="right-align">Closing</th>
                      <th style={{ width: 90 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.length === 0 && (
                      <tr>
                        <td colSpan={6} className="muted" style={{ padding: 22, textAlign: 'center' }}>
                          Nothing went through this account in the window.
                        </td>
                      </tr>
                    )}
                    {data.days.map((d) => (
                      <Fragment key={d.date}>
                        <tr>
                          <td>{fmtDate(d.date)}</td>
                          <td className="right-align">{fmtMoney(d.opening)}</td>
                          <td className="right-align">{d.receipts ? fmtMoney(d.receipts) : ''}</td>
                          <td className="right-align">{d.payments ? fmtMoney(d.payments) : ''}</td>
                          <td className="right-align">{fmtMoney(d.closing)}</td>
                          <td className="right-align">
                            <button
                              type="button"
                              className="btn tiny ghost"
                              onClick={() => setOpen(open === d.date ? null : d.date)}
                            >
                              {open === d.date ? 'Hide' : `${d.rows.length}`}
                            </button>
                          </td>
                        </tr>
                        {open === d.date && (
                          <tr>
                            <td colSpan={6} style={{ background: 'var(--surface-2)' }}>
                              <table className="grid" style={{ margin: 0 }}>
                                <thead>
                                  <tr>
                                    <th style={{ width: 100 }}>Tran. Id</th>
                                    <th>Particulars</th>
                                    <th className="right-align" style={{ width: 130 }}>
                                      In
                                    </th>
                                    <th className="right-align" style={{ width: 130 }}>
                                      Out
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {d.rows.map((p, i) => (
                                    <tr key={i}>
                                      <td className="mono">{p.transId || '—'}</td>
                                      <td>{p.particulars}</td>
                                      <td className="right-align">{p.dr ? fmtMoney(p.dr) : ''}</td>
                                      <td className="right-align">{p.cr ? fmtMoney(p.cr) : ''}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total</th>
                      <th className="right-align">{fmtMoney(data.opening)}</th>
                      <th className="right-align">{fmtMoney(data.totals.receipts)}</th>
                      <th className="right-align">{fmtMoney(data.totals.payments)}</th>
                      <th className="right-align">{fmtMoney(data.closing)}</th>
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

/* ------------------------------------------------------------- sub day book */

export function SubDayBook({ navigate }) {
  const [f, setF] = useState({ from: today(), to: today() })
  const [format, setFormat] = useState('Excel')
  const { data, error, loading, run } = useReport()

  useEffect(() => {
    run(`/admin/sub-day-book?from=${today()}&to=${today()}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function go(e) {
    e.preventDefault()
    run(`/admin/sub-day-book?from=${f.from}&to=${f.to}`)
  }

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function exportIt() {
    if (!data) return
    await emitReport(format, {
      title: 'Sub Day Book',
      fileName: 'Sub_Day_Book',
      branch: data.branch,
      meta: [
        ['From Date', fmtDate(data.from)],
        ['To Date', fmtDate(data.to)],
        ['Transactions', data.totals.count],
        ['Debit', fmtMoney(data.totals.dr)],
        ['Credit', fmtMoney(data.totals.cr)],
      ],
      columns: [
        { label: 'Code', value: (r) => r.glCode || '' },
        { label: 'Ledger Head', value: (r) => r.glName },
        { label: 'Postings', align: 'right', value: (r) => r.count },
        { label: 'Debit', align: 'right', value: (r) => fmtMoney(r.dr) },
        { label: 'Credit', align: 'right', value: (r) => fmtMoney(r.cr) },
      ],
      rows: data.heads,
    })
  }

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>Sub Day Book</h2>
            <p className="muted">The day's work, by the book it came from and by the head it landed on</p>
          </div>
          <Toolbar
            format={format}
            setFormat={setFormat}
            onExport={exportIt}
            canExport={!!data && !loading}
            navigate={navigate}
          />
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <form className="frm" onSubmit={go}>
            <Row label="From Date" req>
              <input type="date" value={f.from} onChange={set('from')} required />
            </Row>
            <Row label="To Date" req>
              <input type="date" value={f.to} onChange={set('to')} required />
            </Row>
            <Row label=" " span={3}>
              <button className="btn primary" type="submit" disabled={loading}>
                {loading ? 'Working…' : 'View'}
              </button>
            </Row>
          </form>

          {data && (
            <>
              <div className="stat-grid" style={{ marginTop: 18 }}>
                <Stat label="Transactions" value={data.totals.count} />
                <Stat label="Debit" value={fmtMoney(data.totals.dr)} />
                <Stat label="Credit" value={fmtMoney(data.totals.cr)} />
                <Stat label="Agrees" value={data.totals.dr === data.totals.cr ? 'Yes' : 'No'} />
              </div>

              <GapNote note={data.note} />

              <div className="frm-sep">
                <span>By ledger head</span>
              </div>

              <div className="table-wrap">
                <table className="grid">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>Code</th>
                      <th>Ledger Head</th>
                      <th className="right-align" style={{ width: 100 }}>
                        Postings
                      </th>
                      <th className="right-align" style={{ width: 140 }}>
                        Debit
                      </th>
                      <th className="right-align" style={{ width: 140 }}>
                        Credit
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.heads.length === 0 && (
                      <tr>
                        <td colSpan={5} className="muted" style={{ padding: 22, textAlign: 'center' }}>
                          Nothing moved in this window.
                        </td>
                      </tr>
                    )}
                    {data.heads.map((h) => (
                      <tr key={h.glCode || `p:${h.pending}`}>
                        <td className="mono">{h.glCode || '—'}</td>
                        <td>
                          {h.glName}
                          {h.pending && <small className="muted"> · no head set</small>}
                        </td>
                        <td className="right-align">{h.count}</td>
                        <td className="right-align">{h.dr ? fmtMoney(h.dr) : ''}</td>
                        <td className="right-align">{h.cr ? fmtMoney(h.cr) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={3}>Total</th>
                      <th className="right-align">{fmtMoney(data.totals.dr)}</th>
                      <th className="right-align">{fmtMoney(data.totals.cr)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="frm-sep">
                <span>By book</span>
              </div>

              {data.groups.length === 0 && <p className="muted">Nothing moved in this window.</p>}
              {data.groups.map((g) => (
                <div key={g.source} style={{ marginBottom: 18 }}>
                  <p className="muted" style={{ marginBottom: 6 }}>
                    <strong>{g.source}</strong> · {g.count} transaction{g.count === 1 ? '' : 's'} ·{' '}
                    {fmtMoney(g.amount)}
                  </p>
                  <div className="table-wrap">
                    <table className="grid">
                      <thead>
                        <tr>
                          <th style={{ width: 100 }}>Tran. Id</th>
                          <th>Particulars</th>
                          <th className="right-align" style={{ width: 140 }}>
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.entries.map((e) => (
                          <tr key={`${e.source}:${e.refId}`} style={e.status !== 'A' ? { opacity: 0.55 } : undefined}>
                            <td className="mono">{e.transId || '—'}</td>
                            <td>
                              {e.particulars}
                              {e.status !== 'A' && <small className="muted"> · {e.status}</small>}
                            </td>
                            <td className="right-align">{fmtMoney(e.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------- receipts & payments */

export function DayBook({ navigate }) {
  const [f, setF] = useState({ from: today(), to: today() })
  const [format, setFormat] = useState('Excel')
  const { data, error, loading, run } = useReport()
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  useEffect(() => {
    run(`/admin/day-book?from=${today()}&to=${today()}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function go(e) {
    e.preventDefault()
    run(`/admin/day-book?from=${f.from}&to=${f.to}`)
  }

  async function exportIt() {
    if (!data) return
    const rows = [
      ...data.receipts.map((r) => ({ side: 'Receipt', ...r })),
      ...data.payments.map((r) => ({ side: 'Payment', ...r })),
    ]
    await emitReport(format, {
      title: 'Receipts & Payments',
      fileName: 'Receipts_And_Payments',
      branch: data.branch,
      meta: [
        ['From Date', fmtDate(data.from)],
        ['To Date', fmtDate(data.to)],
        ['Received', fmtMoney(data.totals.received)],
        ['Paid', fmtMoney(data.totals.paid)],
      ],
      columns: [
        { label: 'Side', value: (r) => r.side },
        { label: 'Code', value: (r) => r.glCode || '' },
        { label: 'Ledger Head', value: (r) => r.glName },
        { label: 'Amount', align: 'right', value: (r) => fmtMoney(r.amount) },
      ],
      rows,
    })
  }

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>Receipts &amp; Payments</h2>
            <p className="muted">What came in and what went out, each side by what it was for</p>
          </div>
          <Toolbar
            format={format}
            setFormat={setFormat}
            onExport={exportIt}
            canExport={!!data && !loading}
            navigate={navigate}
          />
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <form className="frm" onSubmit={go}>
            <Row label="From Date" req>
              <input type="date" value={f.from} onChange={set('from')} required />
            </Row>
            <Row label="To Date" req>
              <input type="date" value={f.to} onChange={set('to')} required />
            </Row>
            <Row label=" " span={3}>
              <button className="btn primary" type="submit" disabled={loading}>
                {loading ? 'Working…' : 'View'}
              </button>
            </Row>
          </form>

          {data && (
            <>
              <div className="stat-grid" style={{ marginTop: 18 }}>
                <Stat label="Received" value={fmtMoney(data.totals.received)} />
                <Stat label="Paid" value={fmtMoney(data.totals.paid)} />
                <Stat label="Net" value={fmtMoney(data.totals.net)} />
                <Stat label="Till not recorded" value={fmtMoney(data.totals.untraced)} />
              </div>

              {data.totals.untraced > 0 && (
                <div className="notice" style={{ marginTop: 12 }}>
                  {fmtMoney(data.totals.untraced)} moved in this window without a mode of payment on record, so it is
                  on neither side above. That is the history taken over from the old system, which recorded the
                  amounts but not the till they went through.
                </div>
              )}

              <GapNote note={data.note} />

              <div className="grid-2" style={{ marginTop: 18 }}>
                <Side title="Receipts" rows={data.receipts} total={data.totals.received} />
                <Side title="Payments" rows={data.payments} total={data.totals.paid} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Side({ title, rows, total }) {
  return (
    <div>
      <div className="frm-sep">
        <span>{title}</span>
      </div>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 80 }}>Code</th>
              <th>Ledger Head</th>
              <th className="right-align" style={{ width: 130 }}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="muted" style={{ padding: 18, textAlign: 'center' }}>
                  Nothing on this side.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.glCode || `p:${r.pending}`}>
                <td className="mono">{r.glCode || '—'}</td>
                <td>
                  {r.glName}
                  {r.pending && <small className="muted"> · no head set</small>}
                </td>
                <td className="right-align">{fmtMoney(r.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={2}>Total</th>
              <th className="right-align">{fmtMoney(total)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ general ledger */

export function GeneralLedger({ navigate }) {
  const { heads } = useHeads()
  const [f, setF] = useState({ glCode: '', glName: '', from: today(), to: today() })
  const [format, setFormat] = useState('Excel')
  const { data, error, loading, run, setError } = useReport()
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  function go(e) {
    e.preventDefault()
    if (!f.glCode) return setError('Pick a GL account.')
    run(`/admin/general-ledger?glCode=${encodeURIComponent(f.glCode)}&from=${f.from}&to=${f.to}`)
  }

  async function exportIt() {
    if (!data) return
    await emitReport(format, {
      title: `General Ledger — ${data.head.code} ${data.head.name}`,
      fileName: `General_Ledger_${data.head.code}`,
      branch: data.branch,
      meta: [
        ['From Date', fmtDate(data.from)],
        ['To Date', fmtDate(data.to)],
        ['Opening Balance', fmtMoney(data.opening)],
        ['Closing Balance', fmtMoney(data.closing)],
      ],
      columns: [
        { label: 'Date', value: (r) => fmtDate(r.date) },
        { label: 'Tran. Id', value: (r) => r.transId },
        { label: 'Particulars', value: (r) => r.particulars },
        { label: 'Debit', align: 'right', value: (r) => (r.dr ? fmtMoney(r.dr) : '') },
        { label: 'Credit', align: 'right', value: (r) => (r.cr ? fmtMoney(r.cr) : '') },
        { label: 'Balance', align: 'right', value: (r) => fmtMoney(r.balance) },
      ],
      rows: data.rows,
    })
  }

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>General Ledger</h2>
            <p className="muted">
              {data ? `${data.head.code} · ${data.head.name}` : 'One ledger head, posting by posting'}
            </p>
          </div>
          <Toolbar
            format={format}
            setFormat={setFormat}
            onExport={exportIt}
            canExport={!!data && !loading}
            navigate={navigate}
          />
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <form className="frm" onSubmit={go}>
            <Row label="GL Code" req>
              <div className="input-with-btn">
                <input
                  className="mono"
                  list="gl-heads"
                  value={f.glCode}
                  onChange={(e) => {
                    const code = e.target.value
                    setF((x) => ({ ...x, glCode: code, glName: heads.find((g) => g.code === code)?.name || '' }))
                  }}
                  placeholder="29000"
                />
                <datalist id="gl-heads">
                  {heads.map((g) => (
                    <option key={g.code} value={g.code}>
                      {g.name}
                    </option>
                  ))}
                </datalist>
              </div>
            </Row>
            <Row label="GL Name">
              <input value={f.glName} readOnly tabIndex={-1} />
            </Row>

            <Row label="From Date" req>
              <input type="date" value={f.from} onChange={set('from')} required />
            </Row>
            <Row label="To Date" req>
              <input type="date" value={f.to} onChange={set('to')} required />
            </Row>

            <Row label=" " span={3}>
              <button className="btn primary" type="submit" disabled={loading}>
                {loading ? 'Working…' : 'View'}
              </button>
            </Row>
          </form>

          {data && (
            <>
              <div className="stat-grid" style={{ marginTop: 18 }}>
                <Stat label="Opening" value={fmtMoney(data.opening)} />
                <Stat label="Debit" value={fmtMoney(data.totals.dr)} />
                <Stat label="Credit" value={fmtMoney(data.totals.cr)} />
                <Stat label="Closing" value={fmtMoney(data.closing)} />
              </div>

              {data.openingSource === 'none' && (
                <div className="notice" style={{ marginTop: 12 }}>
                  This head has no opening balance on record, so the ledger starts from nothing. Enter it under{' '}
                  <strong>Settings → GL Opening Balance</strong>.
                </div>
              )}

              <div className="table-wrap" style={{ marginTop: 18 }}>
                <table className="grid">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Date</th>
                      <th style={{ width: 100 }}>Tran. Id</th>
                      <th>Particulars</th>
                      <th className="right-align" style={{ width: 130 }}>
                        Debit
                      </th>
                      <th className="right-align" style={{ width: 130 }}>
                        Credit
                      </th>
                      <th className="right-align" style={{ width: 140 }}>
                        Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={5}>
                        <em>Opening balance</em>
                      </td>
                      <td className="right-align">{fmtMoney(data.opening)}</td>
                    </tr>
                    {data.rows.map((r, i) => (
                      <tr key={i}>
                        <td>{fmtDate(r.date)}</td>
                        <td className="mono">{r.transId || '—'}</td>
                        <td>{r.particulars}</td>
                        <td className="right-align">{r.dr ? fmtMoney(r.dr) : ''}</td>
                        <td className="right-align">{r.cr ? fmtMoney(r.cr) : ''}</td>
                        <td className="right-align">{fmtMoney(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={3}>Closing balance</th>
                      <th className="right-align">{fmtMoney(data.totals.dr)}</th>
                      <th className="right-align">{fmtMoney(data.totals.cr)}</th>
                      <th className="right-align">{fmtMoney(data.closing)}</th>
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

/* ------------------------------------------------------------- trial balance */

export function TrialBalance({ navigate }) {
  const [asOn, setAsOn] = useState(today())
  const [format, setFormat] = useState('Excel')
  const { data, error, loading, run } = useReport()

  useEffect(() => {
    run(`/admin/trial-balance?asOn=${today()}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function go(e) {
    e.preventDefault()
    run(`/admin/trial-balance?asOn=${asOn}`)
  }

  async function exportIt() {
    if (!data) return
    await emitReport(format, {
      title: 'Trial Balance',
      fileName: 'Trial_Balance',
      branch: data.branch,
      meta: [
        ['As On', fmtDate(data.asOn)],
        ['Debit', fmtMoney(data.totals.debit)],
        ['Credit', fmtMoney(data.totals.credit)],
        ['Difference', fmtMoney(data.totals.difference)],
      ],
      columns: [
        { label: 'Code', value: (r) => r.glCode },
        { label: 'Ledger Head', value: (r) => r.glName },
        { label: 'Group', value: (r) => r.category },
        { label: 'Debit', align: 'right', value: (r) => (r.debit ? fmtMoney(r.debit) : '') },
        { label: 'Credit', align: 'right', value: (r) => (r.credit ? fmtMoney(r.credit) : '') },
      ],
      rows: data.rows,
    })
  }

  const agrees = data && data.totals.difference === 0

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>Trial Balance</h2>
            <p className="muted">Every ledger head from the beginning of the books to a date</p>
          </div>
          <Toolbar
            format={format}
            setFormat={setFormat}
            onExport={exportIt}
            canExport={!!data && !loading}
            navigate={navigate}
          />
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <form className="frm" onSubmit={go}>
            <Row label="Select Date" req>
              <input type="date" value={asOn} onChange={(e) => setAsOn(e.target.value)} required />
            </Row>
            <Row label=" ">
              <button className="btn primary" type="submit" disabled={loading}>
                {loading ? 'Working…' : 'View'}
              </button>
            </Row>
          </form>

          {data && (
            <>
              <div className="stat-grid" style={{ marginTop: 18 }}>
                <Stat label="Debit" value={fmtMoney(data.totals.debit)} />
                <Stat label="Credit" value={fmtMoney(data.totals.credit)} />
                <Stat label="Difference" value={fmtMoney(data.totals.difference)} />
                <Stat label="Agrees" value={agrees ? 'Yes' : 'No'} />
              </div>

              {!agrees && (
                <div className="notice error" style={{ marginTop: 12 }}>
                  The two sides differ by {fmtMoney(Math.abs(data.totals.difference))}. The table below the main one
                  shows what could not be placed on a ledger head — until that is set, a trial balance cannot agree.
                </div>
              )}

              {data.openingBalances === 0 && (
                <div className="notice" style={{ marginTop: 12 }}>
                  No opening balances are on record for this branch, so this is the movement since the books were
                  brought over, not the whole position. Enter them under{' '}
                  <strong>Settings → GL Opening Balance</strong>.
                </div>
              )}

              <div className="table-wrap" style={{ marginTop: 18 }}>
                <table className="grid">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>Code</th>
                      <th>Ledger Head</th>
                      <th style={{ width: 130 }}>Group</th>
                      <th className="right-align" style={{ width: 150 }}>
                        Debit
                      </th>
                      <th className="right-align" style={{ width: 150 }}>
                        Credit
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="muted" style={{ padding: 22, textAlign: 'center' }}>
                          Nothing has been posted to a ledger head yet.
                        </td>
                      </tr>
                    )}
                    {data.rows.map((r) => (
                      <tr key={r.glCode}>
                        <td className="mono">{r.glCode}</td>
                        <td>{r.glName}</td>
                        <td>{r.category || '—'}</td>
                        <td className="right-align">{r.debit ? fmtMoney(r.debit) : ''}</td>
                        <td className="right-align">{r.credit ? fmtMoney(r.credit) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={3}>Total</th>
                      <th className="right-align">{fmtMoney(data.totals.debit)}</th>
                      <th className="right-align">{fmtMoney(data.totals.credit)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {data.unplaced.length > 0 && (
                <>
                  <div className="frm-sep">
                    <span>Not yet on a ledger head</span>
                  </div>
                  <div className="table-wrap">
                    <table className="grid">
                      <thead>
                        <tr>
                          <th>What it is</th>
                          <th className="right-align" style={{ width: 150 }}>
                            Debit
                          </th>
                          <th className="right-align" style={{ width: 150 }}>
                            Credit
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.unplaced.map((u) => (
                          <tr key={u.kind}>
                            <td>{u.glName}</td>
                            <td className="right-align">{u.dr ? fmtMoney(u.dr) : ''}</td>
                            <td className="right-align">{u.cr ? fmtMoney(u.cr) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th>Total</th>
                          <th className="right-align">{fmtMoney(data.totals.unplacedDr)}</th>
                          <th className="right-align">{fmtMoney(data.totals.unplacedCr)}</th>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}

              <div className="frm-sep">
                <span>By group</span>
              </div>
              <div className="stat-grid">
                {Object.entries(data.byCategory).map(([k, v]) => (
                  <Stat key={k} label={k} value={fmtMoney(v)} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------- outstanding report */

// SB_Os.aspx as the Admin menu opens it: the account type is the clerk's to
// pick, "All" included. The product menus open the same report with their own
// type already chosen.
export function AdminOutstanding({ navigate }) {
  const [f, setF] = useState({ asOn: today(), accType: '' })
  const [format, setFormat] = useState('Excel')
  const { data, error, loading, run } = useReport()
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  useEffect(() => {
    run(`/admin/outstanding?asOn=${today()}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function go(e) {
    e.preventDefault()
    run(`/admin/outstanding?asOn=${f.asOn}${f.accType ? `&accType=${f.accType}` : ''}`)
  }

  async function exportIt() {
    if (!data) return
    await emitReport(format, {
      title: 'Outstanding Report',
      fileName: 'Outstanding_Report',
      branch: data.branch,
      meta: [
        ['Outstanding as on', fmtDate(data.asOn)],
        ['Account Type', data.accType || 'All'],
        ['Accounts', data.totals.count],
        ['Balance', fmtMoney(data.totals.balance)],
      ],
      columns: [
        { label: 'Acc. Type', value: (r) => r.accType },
        { label: 'Account No', value: (r) => r.accNo },
        { label: 'Customer', value: (r) => r.customerName },
        { label: 'Cust. Id', value: (r) => r.custId },
        { label: 'Scheme', value: (r) => r.scheme },
        { label: 'Open Date', value: (r) => fmtDate(r.openDate) },
        { label: 'Balance', align: 'right', value: (r) => fmtMoney(r.balance) },
      ],
      rows: data.rows,
    })
  }

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>Outstanding Report</h2>
            <p className="muted">What every product still has on its books as at a date</p>
          </div>
          <Toolbar
            format={format}
            setFormat={setFormat}
            onExport={exportIt}
            canExport={!!data && !loading}
            navigate={navigate}
          />
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <form className="frm" onSubmit={go}>
            <Row label="Account Type">
              <select value={f.accType} onChange={set('accType')}>
                <option value="">All</option>
                {(data?.accTypes || []).map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} · {a.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Outstanding as on" req>
              <input type="date" value={f.asOn} onChange={set('asOn')} required />
            </Row>

            <Row label=" " span={3}>
              <button className="btn primary" type="submit" disabled={loading}>
                {loading ? 'Working…' : 'View'}
              </button>
            </Row>
          </form>

          {data && (
            <>
              <div className="stat-grid" style={{ marginTop: 18 }}>
                <Stat label="Accounts" value={data.totals.count} />
                <Stat label="Balance" value={fmtMoney(data.totals.balance)} />
              </div>

              {data.groups.length > 1 && (
                <>
                  <div className="frm-sep">
                    <span>By product</span>
                  </div>
                  <div className="stat-grid">
                    {data.groups.map((g) => (
                      <Stat key={g.accType} label={`${g.accType} (${g.count})`} value={fmtMoney(g.balance)} />
                    ))}
                  </div>
                </>
              )}

              <div className="table-wrap" style={{ marginTop: 18 }}>
                <table className="grid">
                  <thead>
                    <tr>
                      <th style={{ width: 120 }}>Acc. Type</th>
                      <th style={{ width: 120 }}>Account No</th>
                      <th>Customer</th>
                      <th style={{ width: 100 }}>Cust. Id</th>
                      <th style={{ width: 150 }}>Scheme</th>
                      <th style={{ width: 100 }}>Open Date</th>
                      <th className="right-align" style={{ width: 140 }}>
                        Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="muted" style={{ padding: 22, textAlign: 'center' }}>
                          Nothing was outstanding on that date.
                        </td>
                      </tr>
                    )}
                    {data.rows.map((r) => (
                      <tr key={`${r.osType}:${r.accNo}`}>
                        <td>{r.accType}</td>
                        <td className="mono">{r.accNo}</td>
                        <td>{r.customerName}</td>
                        <td className="mono">{r.custId}</td>
                        <td>{r.scheme || '—'}</td>
                        <td>{fmtDate(r.openDate)}</td>
                        <td className="right-align">{fmtMoney(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={6}>Total</th>
                      <th className="right-align">{fmtMoney(data.totals.balance)}</th>
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

/* ------------------------------------------- balance sheet / profit and loss */

// One screen for both, as the old app had one page for all three statements.
export function Statement({ navigate, kind = 'BS' }) {
  const [asOn, setAsOn] = useState(today())
  const [format, setFormat] = useState('Excel')
  const { data, error, loading, run } = useReport()

  useEffect(() => {
    run(`/admin/statement?rt=${kind}&asOn=${today()}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  function go(e) {
    e.preventDefault()
    run(`/admin/statement?rt=${kind}&asOn=${asOn}`)
  }

  const left = kind === 'BS' ? 'assets' : 'expenditure'
  const right = kind === 'BS' ? 'liabilities' : 'income'
  const LEFT = kind === 'BS' ? 'Assets' : 'Expenditure'
  const RIGHT = kind === 'BS' ? 'Liabilities' : 'Income'

  async function exportIt() {
    if (!data) return
    const rows = [
      ...data[left].flatMap((g) => g.heads.map((h) => ({ side: LEFT, group: g.group, ...h }))),
      ...data[right].flatMap((g) => g.heads.map((h) => ({ side: RIGHT, group: g.group, ...h }))),
    ]
    await emitReport(format, {
      title: data.title,
      fileName: data.title.replace(/[^A-Za-z0-9]+/g, '_'),
      branch: data.branch,
      meta: [
        ['As On', fmtDate(data.asOn)],
        [LEFT, fmtMoney(data.totals[left])],
        [RIGHT, fmtMoney(data.totals[right])],
        [kind === 'BS' ? 'Difference' : 'Surplus', fmtMoney(data.totals.result)],
      ],
      columns: [
        { label: 'Side', value: (r) => r.side },
        { label: 'Group', value: (r) => r.group },
        { label: 'Code', value: (r) => r.glCode },
        { label: 'Ledger Head', value: (r) => r.glName },
        { label: 'Amount', align: 'right', value: (r) => fmtMoney(r.amount) },
      ],
      rows,
    })
  }

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>{kind === 'BS' ? 'Balance Sheet' : 'Profit / Loss'}</h2>
            <p className="muted">
              {kind === 'BS'
                ? 'What the branch holds against what it owes, from the ledger heads it has posted to'
                : 'What the branch earned against what it spent, from the ledger heads it has posted to'}
            </p>
          </div>
          <Toolbar
            format={format}
            setFormat={setFormat}
            onExport={exportIt}
            canExport={!!data && !loading}
            navigate={navigate}
          />
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <form className="frm" onSubmit={go}>
            <Row label="Select Date" req>
              <input type="date" value={asOn} onChange={(e) => setAsOn(e.target.value)} required />
            </Row>
            <Row label=" ">
              <button className="btn primary" type="submit" disabled={loading}>
                {loading ? 'Working…' : 'View'}
              </button>
            </Row>
          </form>

          {data && (
            <>
              <div className="stat-grid" style={{ marginTop: 18 }}>
                <Stat label={LEFT} value={fmtMoney(data.totals[left])} />
                <Stat label={RIGHT} value={fmtMoney(data.totals[right])} />
                <Stat
                  label={kind === 'BS' ? 'Difference' : data.totals.result >= 0 ? 'Surplus' : 'Deficit'}
                  value={fmtMoney(Math.abs(data.totals.result))}
                />
              </div>

              {data.openingBalances === 0 && (
                <div className="notice" style={{ marginTop: 12 }}>
                  No opening balances are on record for this branch, so this is the movement since the books were
                  brought over, not the whole position. Enter them under{' '}
                  <strong>Settings → GL Opening Balance</strong>.
                </div>
              )}

              {data.groupedHeads === 0 && (
                <div className="notice" style={{ marginTop: 12 }}>
                  No ledger heads are grouped yet, so every head stands on its own line. Group them under{' '}
                  <strong>Settings → Report Settings</strong>.
                </div>
              )}

              <GapNote note={data.note} />

              <div className="grid-2" style={{ marginTop: 18 }}>
                <StatementSide title={LEFT} groups={data[left]} total={data.totals[left]} />
                <StatementSide title={RIGHT} groups={data[right]} total={data.totals[right]} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StatementSide({ title, groups, total }) {
  return (
    <div>
      <div className="frm-sep">
        <span>{title}</span>
      </div>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 80 }}>Code</th>
              <th>Ledger Head</th>
              <th className="right-align" style={{ width: 140 }}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={3} className="muted" style={{ padding: 18, textAlign: 'center' }}>
                  Nothing on this side.
                </td>
              </tr>
            )}
            {groups.map((g) => (
              <Fragment key={g.group}>
                <tr>
                  <th colSpan={2}>{g.group}</th>
                  <th className="right-align">{fmtMoney(g.amount)}</th>
                </tr>
                {g.heads.map((h) => (
                  <tr key={h.glCode}>
                    <td className="mono">{h.glCode}</td>
                    <td>{h.glName}</td>
                    <td className="right-align">{fmtMoney(h.amount)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={2}>Total</th>
              <th className="right-align">{fmtMoney(total)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- day end */

// Day_End_Process.aspx: the day as the books have it, then the drawer counted
// note by note and set against the till.
export function DayEnd({ navigate, session }) {
  const [on, setOn] = useState(today())
  const [counts, setCounts] = useState({})
  const [narration, setNarration] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const { data, error, loading, run } = useReport()
  const isAdmin = session?.user?.role === 'admin'

  const load = useCallback(
    async (d) => {
      await run(`/admin/day-end?on=${d}`)
    },
    [run]
  )

  useEffect(() => {
    load(today())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A day already closed opens on the count that was taken.
  useEffect(() => {
    if (!data?.closed) return
    const back = {}
    for (const d of data.closed.denominations) back[d.key] = String(d.count || '')
    setCounts(back)
    setNarration(data.closed.narration || '')
  }, [data?.closed])

  function go(e) {
    e.preventDefault()
    setSaveError('')
    load(on)
  }

  const rows = (data?.denominations || []).map((d) => {
    const count = Number(counts[d.key] || 0)
    return { ...d, count, total: Math.round((count > 0 ? count : 0) * d.value * 100) / 100 }
  })
  const countedTotal = Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100
  const bookClosing = data?.bookClosing ?? 0
  const difference = Math.round((countedTotal - bookClosing) * 100) / 100

  async function close() {
    setSaving(true)
    setSaveError('')
    try {
      const body = { on, counts: Object.fromEntries(rows.map((r) => [r.key, r.count])), narration }
      await api.post('/admin/day-end', body)
      await load(on)
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>Day End Process</h2>
            <p className="muted">
              {data?.closed
                ? `Closed with ${fmtMoney(data.closed.countedTotal)} counted`
                : 'Count the drawer and set it against what the books say is in it'}
            </p>
          </div>
          <div className="master-head-right">
            <button className="btn" onClick={() => window.print()} disabled={!data}>
              Print
            </button>
            <button className="btn ghost" onClick={() => navigate(CLOSE_TO)}>
              Close
            </button>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}
          {saveError && <div className="notice error">{saveError}</div>}

          <form className="frm" onSubmit={go}>
            <Row label="Date" req>
              <input type="date" value={on} onChange={(e) => setOn(e.target.value)} max={today()} required />
            </Row>
            <Row label=" ">
              <button className="btn primary" type="submit" disabled={loading}>
                {loading ? 'Working…' : 'Go'}
              </button>
            </Row>
          </form>

          {data && (
            <>
              <div className="stat-grid" style={{ marginTop: 18 }}>
                <Stat label="Total Receipts" value={fmtMoney(data.receipts)} />
                <Stat label="Total Payments" value={fmtMoney(data.payments)} />
                <Stat label="No. of Transactions" value={data.transactions} />
                <Stat label="Pending Approval" value={data.pendingApproval ?? '—'} />
                <Stat label="JL OD" value={`${data.jlOdCount} · ${fmtMoney(data.jlOdAmount)}`} />
              </div>

              {data.pendingApproval === null && (
                <p className="muted" style={{ marginTop: 10 }}>
                  Pending Approval stays blank until Verify Transaction is built — nothing marks a transaction as
                  approved yet.
                </p>
              )}

              <GapNote note={data.note} />

              <div className="frm-sep">
                <span>Denomination of Notes/Currency</span>
              </div>

              <div className="table-wrap">
                <table className="grid">
                  <thead>
                    <tr>
                      <th style={{ width: 140 }}>Denomination</th>
                      <th style={{ width: 160 }}>Count</th>
                      <th className="right-align">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.key}>
                        <td>{d.label}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className="w-sm"
                            value={counts[d.key] ?? ''}
                            onChange={(e) => setCounts((c) => ({ ...c, [d.key]: e.target.value }))}
                            placeholder={d.value === 1 ? 'rupees' : '0'}
                          />
                        </td>
                        <td className="right-align">{d.total ? fmtMoney(d.total) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={2}>GRAND TOTAL</th>
                      <th className="right-align">{fmtMoney(countedTotal)}</th>
                    </tr>
                    <tr>
                      <th colSpan={2}>CLOSING CASH ({data.cash.name})</th>
                      <th className="right-align">{fmtMoney(bookClosing)}</th>
                    </tr>
                    <tr>
                      <th colSpan={2}>{difference === 0 ? 'Tallies' : difference > 0 ? 'Over' : 'Short'}</th>
                      <th className="right-align">{fmtMoney(Math.abs(difference))}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {data.openingSource === 'none' && (
                <div className="notice" style={{ marginTop: 12 }}>
                  The till has no opening balance on record, so the closing cash above is the movement since the
                  books were brought over, not what is really in the drawer. Enter it under{' '}
                  <strong>Settings → GL Opening Balance</strong>.
                </div>
              )}

              <div className="frm" style={{ marginTop: 18 }}>
                <Row label="Narration" span={3}>
                  <input
                    value={narration}
                    onChange={(e) => setNarration(e.target.value)}
                    placeholder={difference === 0 ? '' : 'Why the count and the books differ'}
                  />
                </Row>
              </div>

              {data.closed && (
                <div className="notice success" style={{ marginTop: 12 }}>
                  This day was closed on {fmtDate(data.closed.closedAt)} with {fmtMoney(data.closed.countedTotal)}{' '}
                  counted against {fmtMoney(data.closed.bookClosing)} in the books. Closing it again replaces that
                  count.
                </div>
              )}
            </>
          )}
        </div>

        <div className="master-foot">
          <button className="btn ghost" onClick={() => navigate(CLOSE_TO)} disabled={saving}>
            Close
          </button>
          <button className="btn primary" onClick={close} disabled={saving || !data || !isAdmin}>
            {saving ? 'Saving…' : data?.closed ? 'Save the count again' : 'Day End'}
          </button>
        </div>

        {!isAdmin && (
          <p className="muted" style={{ padding: '0 24px 20px' }}>
            Only an admin can close the day.
          </p>
        )}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- form ndh3 */

// Form_NDH3.aspx is a date range and an export — its form is built on the
// server, so what is shown here is the figures from our own books for that
// period, named for what they are.
export function FormNdh3({ navigate }) {
  const [f, setF] = useState({ from: today(), to: today() })
  const [format, setFormat] = useState('Excel')
  const { data, error, loading, run } = useReport()
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  function go(e) {
    e.preventDefault()
    run(`/admin/ndh3?from=${f.from}&to=${f.to}`)
  }

  async function exportIt() {
    if (!data) return
    const rows = data.sections.flatMap((s) =>
      s.rows.map((r) => ({ section: s.title, label: r.label, value: r.kind === 'money' ? fmtMoney(r.value) : r.value }))
    )
    await emitReport(format, {
      title: 'Form NDH3',
      fileName: 'Form_NDH3',
      branch: data.branch,
      meta: [
        ['From Date', fmtDate(data.from)],
        ['To Date', fmtDate(data.to)],
      ],
      columns: [
        { label: 'Section', value: (r) => r.section },
        { label: 'Particulars', value: (r) => r.label },
        { label: 'Figure', align: 'right', value: (r) => r.value },
      ],
      rows,
    })
  }

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>Form NDH3</h2>
            <p className="muted">The half-yearly return's figures, read off this branch's books</p>
          </div>
          <Toolbar
            format={format}
            setFormat={setFormat}
            onExport={exportIt}
            canExport={!!data && !loading}
            navigate={navigate}
          />
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <form className="frm" onSubmit={go}>
            <Row label="From Date" req>
              <input type="date" value={f.from} onChange={set('from')} required />
            </Row>
            <Row label="To Date" req>
              <input type="date" value={f.to} onChange={set('to')} required />
            </Row>
            <Row label=" " span={3}>
              <button className="btn primary" type="submit" disabled={loading}>
                {loading ? 'Working…' : 'Report'}
              </button>
            </Row>
          </form>

          {data && (
            <>
              {data.cannot.length > 0 && (
                <div className="notice" style={{ marginTop: 18 }}>
                  <p>Before this is filed:</p>
                  <ul style={{ margin: '8px 0 0 18px' }}>
                    {data.cannot.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              <GapNote note={data.note} />

              {data.sections.map((s) => (
                <div key={s.title}>
                  <div className="frm-sep">
                    <span>{s.title}</span>
                  </div>
                  <div className="table-wrap">
                    <table className="grid">
                      <thead>
                        <tr>
                          <th>Particulars</th>
                          <th className="right-align" style={{ width: 180 }}>
                            Figure
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.rows.map((r) => (
                          <tr key={r.label}>
                            <td>{r.label}</td>
                            <td className="right-align">{r.kind === 'money' ? fmtMoney(r.value) : r.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
