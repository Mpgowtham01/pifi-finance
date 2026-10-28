import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate, fmtMoney } from '../../lib/format.js'

// Repledge_List.aspx and Repledge_Closure.aspx. A re-pledge is our own
// borrowing: a bundle of customers' pledges goes to a bank and we take a loan
// against it. While it is out, those loans are flagged and cannot be deleted.

const today = () => new Date().toISOString().slice(0, 10)
const n = (v) => (v === '' || isNaN(Number(v)) ? 0 : Number(v))

export function RepledgeList({ navigate, session }) {
  const [rows, setRows] = useState([])
  const [status, setStatus] = useState('')
  const [term, setTerm] = useState('')
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get(`/loans/repledge?q=${encodeURIComponent(q)}&status=${status}`)
      setRows(r.rows)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [q, status])

  useEffect(() => {
    load()
  }, [load])

  const isAdmin = session?.user?.role === 'admin'

  return (
    <div>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault()
          setQ(term.trim())
        }}
      >
        <div className="search">
          <input placeholder="Bank name, bank a/c no or our reference…" value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All status</option>
          <option value="A">A — Out with the bank</option>
          <option value="C">C — Closed</option>
        </select>
        <button className="btn" type="submit">
          Go
        </button>
        {isAdmin && (
          <button type="button" className="btn primary" onClick={() => setCreating(true)}>
            + New Re-pledge
          </button>
        )}
      </form>

      {error && <div className="notice error">{error}</div>}

      <div className="card">
        <div className="card-head">
          <strong>{loading ? 'Loading…' : `${rows.length} record${rows.length === 1 ? '' : 's'}`}</strong>
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 120 }}>Reference</th>
                <th>Bank</th>
                <th style={{ width: 130 }}>Bank A/c No</th>
                <th style={{ width: 100 }}>Open Date</th>
                <th style={{ width: 100 }}>Due Date</th>
                <th style={{ width: 60 }} className="right-align">Period</th>
                <th style={{ width: 70 }} className="right-align">ROI</th>
                <th style={{ width: 80 }} className="right-align">Pledges</th>
                <th style={{ width: 90 }} className="right-align">Net (g)</th>
                <th style={{ width: 120 }} className="right-align">Borrowed</th>
                <th style={{ width: 70 }}>Status</th>
                <th style={{ width: 90 }} className="right-align" />
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="muted" style={{ padding: 26, textAlign: 'center' }}>
                    No re-pledges yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.accNo}</td>
                  <td>{r.bankName || '—'}</td>
                  <td className="mono">{r.bankAccNo || '—'}</td>
                  <td>{fmtDate(r.openDate)}</td>
                  <td>{fmtDate(r.dueDate)}</td>
                  <td className="right-align">{r.periodMonths}</td>
                  <td className="right-align">{r.interestRate}</td>
                  <td className="right-align">{r.loans.length}</td>
                  <td className="right-align">{r.netWeight}</td>
                  <td className="right-align">{fmtMoney(r.loanAmount)}</td>
                  <td>
                    <span className={`badge ${r.status === 'A' ? 'ok' : 'neutral'}`}>{r.status}</span>
                  </td>
                  <td className="right-align">
                    {r.status === 'A' && isAdmin && (
                      <button className="btn tiny" onClick={() => navigate('jl-repledge-close', { id: r.id })}>
                        Close
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {creating && (
        <NewRepledge
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false)
            load()
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------ new bundle */

function NewRepledge({ onClose, onDone }) {
  const [loans, setLoans] = useState([])
  const [picked, setPicked] = useState(() => new Set())
  const [term, setTerm] = useState('')
  const [form, setForm] = useState({
    bankName: '', bankAccNo: '', openDate: today(), periodMonths: '12',
    loanAmount: '', interestRate: '', compounding: 'Monthly', narration: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get(`/loans/jewel?status=A&limit=200&q=${encodeURIComponent(term)}&field=name`)
      .then((r) => setLoans(r.loans.filter((l) => !l.repledged)))
      .catch((e) => setError(e.message))
  }, [term])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const toggle = (id) =>
    setPicked((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const chosen = loans.filter((l) => picked.has(l.id))
  const weight = Math.round(chosen.reduce((t, l) => t + l.netWeight, 0) * 100) / 100

  async function save() {
    if (picked.size === 0) {
      setError('Tick the pledges going to the bank.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.post('/loans/repledge', { ...form, loans: [...picked] })
      onDone()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true">
        <div className="modal-head">New re-pledge</div>
        <div className="modal-body">
          {error && <div className="notice error">{error}</div>}
          <div className="frm">
            <Row label="Bank" req>
              <input value={form.bankName} onChange={set('bankName')} autoFocus />
            </Row>
            <Row label="Bank A/c No">
              <input className="mono" value={form.bankAccNo} onChange={set('bankAccNo')} />
            </Row>
            <Row label="Open date">
              <input type="date" value={form.openDate} onChange={set('openDate')} />
            </Row>
            <Row label="Period (months)">
              <input type="number" min="1" value={form.periodMonths} onChange={set('periodMonths')} />
            </Row>
            <Row label="Amount borrowed" req>
              <input type="number" step="0.01" value={form.loanAmount} onChange={set('loanAmount')} />
            </Row>
            <Row label="Interest rate %">
              <input type="number" step="0.01" value={form.interestRate} onChange={set('interestRate')} />
            </Row>
          </div>

          <div className="search" style={{ margin: '14px 0 8px' }}>
            <input placeholder="Filter the live pledges by customer name…" value={term} onChange={(e) => setTerm(e.target.value)} />
          </div>
          <p className="muted" style={{ margin: '0 0 8px' }}>
            {picked.size} pledge{picked.size === 1 ? '' : 's'} picked · {weight} g net
          </p>
          <div className="picker-results">
            {loans.map((l) => (
              <label key={l.id} className="check-row">
                <input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} />
                <span className="mono">{l.accNo}</span>
                <span style={{ flex: 1 }}>{l.customerName}</span>
                <span className="muted">{l.netWeight} g</span>
                <span className="muted">{fmtMoney(l.principalBalance)}</span>
              </label>
            ))}
            {loans.length === 0 && <p className="muted">No live pledges are free to hand over.</p>}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy || n(form.loanAmount) <= 0}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- closure */

export function RepledgeClosure({ navigate, id, accNo: initialAccNo }) {
  const [data, setData] = useState(null)
  const [glAccounts, setGlAccounts] = useState([])
  const [transId, setTransId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [accNo, setAccNo] = useState(initialAccNo || '')
  const [form, setForm] = useState({
    transDate: today(), principalPayable: '', interestPayable: '', glCodeCr: '', glCodeDr: '', narration: '',
  })

  // The chart of accounts and the next transaction number, from the same
  // place the loan screens take them.
  useEffect(() => {
    api
      .get('/loans/jewel/new')
      .then((d) => {
        setGlAccounts(d.glAccounts)
        setTransId(d.transId)
        setForm((f) => ({ ...f, glCodeCr: f.glCodeCr || d.glAccounts[0]?.code || '' }))
      })
      .catch(() => {})
  }, [])

  const openQuote = useCallback(async (repledgeId) => {
    try {
      const r = await api.get(`/loans/repledge/${repledgeId}/quote`)
      setData(r)
      setAccNo(r.repledge.accNo)
      setError('')
      setForm((f) => ({
        ...f,
        principalPayable: String(r.quote.principalDue),
        interestPayable: String(r.quote.interestDue),
      }))
    } catch (e) {
      setData(null)
      setError(e.message)
    }
  }, [])

  // Opened from the list with one already chosen, or on its own with none.
  useEffect(() => {
    if (id) openQuote(id)
  }, [id, openQuote])

  // Find one by the reference typed into the box.
  async function findByAccNo(e) {
    e?.preventDefault()
    const v = String(accNo || '').trim()
    if (!v) return
    try {
      const { repledge } = await api.get(`/loans/repledge/lookup/${encodeURIComponent(v)}`)
      if (repledge.status === 'C') {
        setData(null)
        setError(`${repledge.accNo} was already closed on ${fmtDate(repledge.closedDate)}.`)
        return
      }
      await openQuote(repledge.id)
    } catch (e2) {
      setData(null)
      setError(e2.message)
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const total = Math.round((n(form.principalPayable) + n(form.interestPayable)) * 100) / 100

  async function close() {
    setBusy(true)
    setError('')
    try {
      await api.post(`/loans/repledge/${id}/close`, form)
      navigate('jl-repledge')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Drawn before a re-pledge is found, so every field reads through a
  // stand-in and the formatter turns a missing number into a blank.
  const repledge = data?.repledge || {}
  const quote = data?.quote || {}
  const loans = data?.loans || []
  const ready = !!data


  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>Re-pledge Closure</h2>
            <p className="muted">
              {ready ? `${repledge.accNo} · ${repledge.bankName}` : 'Bring a bundle of pledges back from the bank'}
            </p>
          </div>
          <div className="master-head-right">
            <span className="master-date">{fmtDate(new Date())}</span>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <div className="stat-grid">
            <Stat label="Borrowed" value={fmtMoney(repledge.loanAmount)} />
            <Stat label="Principal outstanding" value={fmtMoney(quote.principalDue)} />
            <Stat label="Interest payable" value={fmtMoney(quote.interestDue)} />
            <Stat label="To release today" value={fmtMoney(quote.closingAmount)} />
          </div>

          <div className="frm" style={{ marginTop: 18 }}>
            <Row label="Reference" req>
              <div className="input-with-btn">
                <input
                  className="mono"
                  value={accNo}
                  onChange={(e) => setAccNo(e.target.value)}
                  onBlur={findByAccNo}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      findByAccNo(e)
                    }
                  }}
                  placeholder="RP20100001"
                />
                <button type="button" className="btn ghost" onClick={findByAccNo}>
                  Go
                </button>
              </div>
            </Row>
            <Row label="Bank Name">
              <input value={ready ? `${repledge.bankName} · ${repledge.bankAccNo}` : ''} readOnly />
            </Row>
            <Row label="Loan Amount">{ready ? fmtMoney(repledge.loanAmount) : '—'}</Row>
            <Row label="Open Date">{fmtDate(repledge.openDate) || '—'}</Row>
            <Row label="Due Date">{fmtDate(repledge.dueDate) || '—'}</Row>
            <Row label="Period">{ready ? `${repledge.periodMonths} months` : '—'}</Row>
            <Row label="Scheme Code">{repledge.schemeCode || '—'}</Row>
            <Row label="Account Status">{ready ? (repledge.status === 'C' ? 'C-Closed' : 'A-Active') : '—'}</Row>
            <Row label="Interest Rate">{ready ? `${repledge.interestRate}%` : '—'}</Row>
            <Row label="Compounding">{repledge.compounding || '—'}</Row>
            <Row label="Closing Balance">{ready ? fmtMoney(quote.principalDue) : '—'}</Row>
            <Row label="Transaction Id"><span className="mono">{transId || '—'}</span></Row>
            <Row label="Trans. date">
              <input type="date" value={form.transDate} onChange={set('transDate')} disabled={!ready} />
            </Row>
            <Row label="Principal paid">
              <input type="number" step="0.01" value={form.principalPayable} onChange={set('principalPayable')} disabled={!ready} />
            </Row>
            <Row label="Interest paid">
              <input type="number" step="0.01" value={form.interestPayable} onChange={set('interestPayable')} disabled={!ready} />
            </Row>
            <Row label="Net Amount">
              <input value={fmtMoney(total)} readOnly />
            </Row>
            <Row label="Mode of Payment">
              <select value={form.glCodeCr} onChange={set('glCodeCr')} disabled={!ready}>
                {glAccounts.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Debit Account">
              <select value={form.glCodeDr} onChange={set('glCodeDr')} disabled={!ready}>
                <option value="">Same as the re-pledge</option>
                {glAccounts.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Narration" span={3}>
              <input value={form.narration} onChange={set('narration')} disabled={!ready} />
            </Row>
          </div>

          <div className="frm-sep">
            <span>Jewels coming back ({loans.length} pledges)</span>
          </div>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Account No</th>
                  <th>Customer</th>
                  <th style={{ width: 100 }} className="right-align">Net (g)</th>
                  <th style={{ width: 120 }} className="right-align">Balance</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id}>
                    <td className="mono">{l.accNo}</td>
                    <td>{l.customerName}</td>
                    <td className="right-align">{l.netWeight}</td>
                    <td className="right-align">{fmtMoney(l.principalBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="master-foot">
          <button className="btn ghost" onClick={() => navigate('jl-repledge')} disabled={busy}>
            Close
          </button>
          <button className="btn primary" onClick={close} disabled={busy || !ready}>
            {busy ? 'Saving…' : 'Close the re-pledge'}
          </button>
        </div>
      </div>
    </div>
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
