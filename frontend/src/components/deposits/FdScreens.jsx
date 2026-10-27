import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate, fmtMoney } from '../../lib/format.js'

// One deposit in full, the interest payout, the closure and the renewal —
// FD_Interest_Payment.aspx, FD_Account_Closure.aspx and FD_Renewal.aspx.

const today = () => new Date().toISOString().slice(0, 10)
const n = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? 0 : Number(v))
const r2 = (v) => Math.round(n(v) * 100) / 100
const REPAYMENT_LABELS = { '1A': 'Monthly', '3A': 'Quarterly', M: 'On maturity' }

/* ------------------------------------------------------------ one deposit */

export function FdView({ navigate, id, session }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await api.get(`/deposits/${id}`))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function doCancel() {
    setBusy(true)
    try {
      await api.post(`/deposits/transactions/${cancelling.id}/cancel`, { reason })
      setCancelling(null)
      setReason('')
      load()
    } catch (e) {
      setError(e.message)
      setCancelling(null)
    } finally {
      setBusy(false)
    }
  }

  if (error && !data) return <div className="notice error">{error}</div>
  if (!data) return <div className="muted">Loading…</div>

  const { deposit: d, customer, transactions } = data
  const isAdmin = session?.user?.role === 'admin'
  const matured = d.status === 'A' && new Date(d.maturityDate) <= new Date()

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>
              {d.accNo}{' '}
              <span className={`badge ${d.status === 'A' ? 'ok' : 'neutral'}`}>
                {d.status === 'A' ? 'Active' : 'Closed'}
              </span>
              {matured && <span className="badge warn" style={{ marginLeft: 6 }}>Matured</span>}
            </h2>
            <p className="muted">
              {d.customerName} · {d.custId}
              {customer?.mobile ? ` · ${customer.mobile}` : ''}
            </p>
          </div>
          <div className="master-head-right">
            {d.status === 'A' && (
              <>
                {d.interestRepayment !== 'M' && (
                  <button className="btn primary" onClick={() => navigate('fd-interest', { accNo: d.accNo })}>
                    Pay interest
                  </button>
                )}
                <button className="btn" onClick={() => navigate('fd-renewal', { accNo: d.accNo })}>
                  Renew
                </button>
                <button className="btn" onClick={() => navigate('fd-closure', { accNo: d.accNo })}>
                  Close
                </button>
              </>
            )}
            <button className="btn ghost" onClick={() => navigate('fd-statement', { accNo: d.accNo })}>
              Statement
            </button>
            {isAdmin && d.status === 'A' && (
              <button className="btn ghost" onClick={() => navigate('fd-edit', { id: d.id })}>
                Edit
              </button>
            )}
            <button className="btn ghost" onClick={() => navigate('fd-list')}>
              Close
            </button>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <div className="stat-grid">
            <Stat label="Deposit amount" value={fmtMoney(d.depositAmount)} />
            <Stat label="Maturity amount" value={fmtMoney(d.maturityAmount)} />
            <Stat label="Maturity date" value={fmtDate(d.maturityDate)} />
            <Stat label="Interest paid so far" value={fmtMoney(d.interestPaid)} />
          </div>

          <div className="frm" style={{ marginTop: 18 }}>
            <Row label="Scheme">{d.schemeName || d.schemeCode || '—'}</Row>
            <Row label="Mode of operation">{d.mop}</Row>
            <Row label="Open / Effect">
              {fmtDate(d.openDate)} — {fmtDate(d.effectDate)}
            </Row>
            <Row label="Period">{d.periodMonths} months</Row>
            <Row label="Interest rate">{d.interestRate}% a year</Row>
            <Row label="Interest repayment">{REPAYMENT_LABELS[d.interestRepayment] || d.interestRepayment}</Row>
            <Row label="Compounding">{d.compounding === 'N' ? 'None' : d.compounding}</Row>
            <Row label="Interest paid up to">{d.interestUpto ? fmtDate(d.interestUpto) : '—'}</Row>
            <Row label="Joint holders">
              {d.jointNames?.filter(Boolean).length ? d.jointNames.filter(Boolean).join(', ') : '—'}
            </Row>
            <Row label="Nominee">
              {d.nominee?.name
                ? `${d.nominee.name}${d.nominee.relation ? ` (${d.nominee.relation})` : ''}`
                : '—'}
            </Row>
            <Row label="Flags">
              {[
                d.isSeniorCitizen && 'Sr. Citizen',
                d.isSuperSenior && 'Super Sr.',
                d.isStaff && 'Staff',
                d.deductTds && 'TDS',
              ]
                .filter(Boolean)
                .join(', ') || '—'}
            </Row>
            <Row label="Lien">
              {d.lienAmount > 0 ? `${fmtMoney(d.lienAmount)} against ${d.lienAccNo || 'a loan'}` : '—'}
            </Row>
            {d.renewedFrom && <Row label="Renewed from">{d.renewedFrom}</Row>}
            {d.renewedInto && <Row label="Renewed into">{d.renewedInto}</Row>}
            {d.status === 'C' && (
              <>
                <Row label="Closed on">{fmtDate(d.closedDate)}</Row>
                <Row label="Paid out">{fmtMoney(d.closureAmount)}</Row>
              </>
            )}
            {d.narration && (
              <Row label="Narration" span={3}>
                {d.narration}
              </Row>
            )}
          </div>

          <div className="frm-sep">
            <span>Entries</span>
          </div>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Trans. Id</th>
                  <th style={{ width: 110 }}>Date</th>
                  <th>Particulars</th>
                  <th className="right-align">In</th>
                  <th className="right-align">Out</th>
                  <th className="right-align">TDS</th>
                  <th style={{ width: 90 }} className="right-align" />
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted" style={{ padding: 22, textAlign: 'center' }}>
                      Nothing posted yet.
                    </td>
                  </tr>
                )}
                {transactions.map((t) => (
                  <tr key={t.id} style={t.status === 'cancelled' ? { opacity: 0.55 } : undefined}>
                    <td className="mono">{t.transId}</td>
                    <td>{fmtDate(t.transDate)}</td>
                    <td>
                      {t.narration || t.kind}
                      {t.status === 'cancelled' && (
                        <span className="badge off" style={{ marginLeft: 6 }}>
                          Cancelled
                        </span>
                      )}
                    </td>
                    <td className="right-align">{t.type === 'Credit' ? fmtMoney(t.amount) : ''}</td>
                    <td className="right-align">{t.type === 'Debit' ? fmtMoney(t.amount) : ''}</td>
                    <td className="right-align">{t.tds ? fmtMoney(t.tds) : ''}</td>
                    <td className="right-align">
                      {isAdmin && t.status === 'A' && (
                        <button className="btn tiny ghost" onClick={() => setCancelling(t)}>
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {cancelling && (
        <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setCancelling(null)}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-head">Cancel entry {cancelling.transId}</div>
            <div className="modal-body">
              <p style={{ marginTop: 0 }}>
                {fmtMoney(cancelling.amount)} on {fmtDate(cancelling.transDate)} goes back. The row stays with
                the reason against it.
              </p>
              <label className="lbl" htmlFor="fd-cancel-reason">
                Reason
              </label>
              <input
                id="fd-cancel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setCancelling(null)} disabled={busy}>
                Keep it
              </button>
              <button className="btn danger" onClick={doCancel} disabled={busy || reason.trim().length < 4}>
                {busy ? 'Cancelling…' : 'Cancel it'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------- interest payment */

export function FdInterestPayment({ navigate, accNo: initialAccNo }) {
  const [accNo, setAccNo] = useState(initialAccNo || '')
  const [quote, setQuote] = useState(null)
  const [glAccounts, setGlAccounts] = useState([])
  const [form, setForm] = useState({ to: today(), transDate: today(), amount: '', tds: '', glCode: '', narration: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const [busy, setBusy] = useState(false)
  const accRef = useRef(null)

  useEffect(() => {
    api
      .get('/deposits/new')
      .then((d) => {
        setGlAccounts(d.glAccounts)
        setForm((f) => ({ ...f, glCode: f.glCode || d.glAccounts[0]?.code || '' }))
      })
      .catch(() => {})
  }, [])

  const lookup = useCallback(
    async (no, to) => {
      const v = String(no || '').trim()
      if (!v) return
      try {
        const { deposit } = await api.get(`/deposits/lookup/${encodeURIComponent(v)}`)
        if (deposit.interestRepayment === 'M') {
          setQuote(null)
          setError(`${deposit.accNo} pays its interest on maturity, so there is nothing to pay out now.`)
          return
        }
        const q = await api.get(`/deposits/${deposit.id}/interest-quote?asOn=${to}`)
        setQuote(q)
        setAccNo(deposit.accNo)
        setForm((f) => ({ ...f, amount: String(q.interest), tds: String(q.tds) }))
        setError(deposit.status === 'C' ? 'That deposit is closed.' : '')
      } catch (e) {
        setQuote(null)
        setError(e.message)
      }
    },
    []
  )

  useEffect(() => {
    if (initialAccNo) lookup(initialAccNo, today())
    else accRef.current?.focus()
  }, [initialAccNo, lookup])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const payable = r2(n(form.amount) - n(form.tds))

  async function save(e) {
    e.preventDefault()
    if (!quote) return
    setBusy(true)
    setError('')
    try {
      const r = await api.post(`/deposits/${quote.deposit.id}/interest-payment`, {
        to: form.to,
        transDate: form.transDate,
        amount: n(form.amount),
        tds: n(form.tds),
        glCode: form.glCode,
        narration: form.narration,
      })
      setDone(r)
    } catch (e2) {
      setError(e2.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="master">
        <div className="card">
          <header className="master-head">
            <div>
              <h2>Interest paid</h2>
              <p className="muted">
                {done.deposit.accNo} · {done.deposit.customerName} · {fmtDate(done.transaction.transDate)}
              </p>
            </div>
            <div className="master-head-right">
              <button className="btn" onClick={() => window.print()}>
                Print
              </button>
            </div>
          </header>
          <div className="master-body">
            <div className="notice success">
              {fmtMoney(done.transaction.amount - done.transaction.tds)} paid out
              {done.transaction.tds > 0 ? ` after ${fmtMoney(done.transaction.tds)} TDS` : ''}, covering{' '}
              {fmtDate(done.transaction.fromDate)} to {fmtDate(done.transaction.toDate)}.
            </div>
          </div>
          <div className="master-foot">
            <button className="btn ghost" onClick={() => navigate('fd-view', { id: done.deposit.id })}>
              Open the deposit
            </button>
            <button className="btn primary" onClick={() => navigate('fd-list')}>
              Back to the list
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form className="master" onSubmit={save}>
      <div className="card">
        <header className="master-head">
          <div>
            <h2>FD Interest Payment</h2>
            <p className="muted">
              {quote ? `${quote.deposit.accNo} · ${quote.deposit.customerName}` : 'Find the deposit'}
            </p>
          </div>
          <div className="master-head-right">
            <span className="master-date">{fmtDate(new Date())}</span>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <div className="frm">
            <Row label="Account No" req>
              <div className="input-with-btn">
                <input
                  ref={accRef}
                  className="mono"
                  value={accNo}
                  onChange={(e) => setAccNo(e.target.value)}
                  onBlur={(e) => lookup(e.target.value, form.to)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      lookup(accNo, form.to)
                    }
                  }}
                  placeholder="201300001"
                />
                <button type="button" className="btn ghost" onClick={() => lookup(accNo, form.to)}>
                  Go
                </button>
              </div>
            </Row>
            <Row label="Customer">
              <input value={quote ? `${quote.deposit.custId} / ${quote.deposit.customerName}` : ''} readOnly />
            </Row>
          </div>

          {quote && (
            <>
              <div className="stat-grid" style={{ marginTop: 18 }}>
                <Stat label="Deposit" value={fmtMoney(quote.deposit.depositAmount)} />
                <Stat label="Rate" value={`${quote.deposit.interestRate}%`} />
                <Stat label="Interest due" value={fmtMoney(quote.interest)} />
                <Stat label="Payable" value={fmtMoney(payable)} />
              </div>

              <div className="frm" style={{ marginTop: 18 }}>
                <Row label="Interest from">
                  <input value={fmtDate(quote.from)} readOnly />
                </Row>
                <Row label="Interest up to">
                  <input
                    type="date"
                    value={form.to}
                    onChange={(e) => {
                      set('to')(e)
                      lookup(accNo, e.target.value)
                    }}
                  />
                </Row>

                <Row label="Interest" req>
                  <input type="number" step="0.01" value={form.amount} onChange={set('amount')} />
                </Row>
                <Row label="TDS">
                  <input type="number" step="0.01" value={form.tds} onChange={set('tds')} />
                </Row>

                <Row label="Payable">
                  <input value={fmtMoney(payable)} readOnly />
                </Row>
                <Row label="Paid through">
                  <select value={form.glCode} onChange={set('glCode')}>
                    {glAccounts.map((g) => (
                      <option key={g.code} value={g.code}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </Row>

                <Row label="Trans. Date">
                  <input type="date" value={form.transDate} onChange={set('transDate')} />
                </Row>
                <Row label="Narration">
                  <input value={form.narration} onChange={set('narration')} />
                </Row>
              </div>
            </>
          )}
        </div>

        <div className="master-foot">
          <button type="button" className="btn ghost" onClick={() => navigate('fd-list')} disabled={busy}>
            Close
          </button>
          <button className="btn primary" type="submit" disabled={busy || !quote || n(form.amount) <= 0}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  )
}

/* --------------------------------------------------------------- closure */

export function FdClosure({ navigate, accNo: initialAccNo }) {
  const [accNo, setAccNo] = useState(initialAccNo || '')
  const [quote, setQuote] = useState(null)
  const [glAccounts, setGlAccounts] = useState([])
  const [form, setForm] = useState({
    transDate: today(), principalPayable: '', interestPayable: '', tds: '', glCode: '', narration: '',
  })
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const [busy, setBusy] = useState(false)
  const accRef = useRef(null)

  useEffect(() => {
    api
      .get('/deposits/new')
      .then((d) => {
        setGlAccounts(d.glAccounts)
        setForm((f) => ({ ...f, glCode: f.glCode || d.glAccounts[0]?.code || '' }))
      })
      .catch(() => {})
  }, [])

  const lookup = useCallback(async (no) => {
    const v = String(no || '').trim()
    if (!v) return
    try {
      const { deposit } = await api.get(`/deposits/lookup/${encodeURIComponent(v)}`)
      if (deposit.status === 'C') {
        setQuote(null)
        setError(`${deposit.accNo} was already closed on ${fmtDate(deposit.closedDate)}.`)
        return
      }
      const q = await api.get(`/deposits/${deposit.id}/closure-quote`)
      setQuote(q)
      setAccNo(deposit.accNo)
      setForm((f) => ({
        ...f,
        principalPayable: String(q.principalPayable),
        interestPayable: String(q.interestPayable),
        tds: String(q.tds),
      }))
      setError('')
    } catch (e) {
      setQuote(null)
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    if (initialAccNo) lookup(initialAccNo)
    else accRef.current?.focus()
  }, [initialAccNo, lookup])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const payable = r2(n(form.principalPayable) + n(form.interestPayable) - n(form.tds))

  async function close(e) {
    e.preventDefault()
    if (!quote) return
    setBusy(true)
    setError('')
    try {
      const r = await api.post(`/deposits/${quote.deposit.id}/close`, {
        transDate: form.transDate,
        principalPayable: n(form.principalPayable),
        interestPayable: n(form.interestPayable),
        tds: n(form.tds),
        glCode: form.glCode,
        narration: form.narration,
      })
      setDone(r)
    } catch (e2) {
      setError(e2.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="master">
        <div className="card">
          <header className="master-head">
            <div>
              <h2>{done.deposit.accNo} closed</h2>
              <p className="muted">
                {done.deposit.customerName} · {fmtDate(done.deposit.closedDate)}
              </p>
            </div>
          </header>
          <div className="master-body">
            <div className="notice success">{fmtMoney(done.paidOut)} paid out. The deposit is now closed.</div>
          </div>
          <div className="master-foot">
            <button className="btn ghost" onClick={() => navigate('fd-view', { id: done.deposit.id })}>
              Open the deposit
            </button>
            <button className="btn primary" onClick={() => navigate('fd-list')}>
              Back to the list
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form className="master" onSubmit={close}>
      <div className="card">
        <header className="master-head">
          <div>
            <h2>FD Account Closure</h2>
            <p className="muted">
              {quote ? `${quote.deposit.accNo} · ${quote.deposit.customerName}` : 'Find the deposit to close'}
            </p>
          </div>
          <div className="master-head-right">
            <span className="master-date">{fmtDate(new Date())}</span>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <div className="frm">
            <Row label="Account No" req>
              <div className="input-with-btn">
                <input
                  ref={accRef}
                  className="mono"
                  value={accNo}
                  onChange={(e) => setAccNo(e.target.value)}
                  onBlur={(e) => lookup(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      lookup(accNo)
                    }
                  }}
                  placeholder="201300001"
                />
                <button type="button" className="btn ghost" onClick={() => lookup(accNo)}>
                  View Details
                </button>
              </div>
            </Row>
            <Row label="Customer">
              <input value={quote ? `${quote.deposit.custId} / ${quote.deposit.customerName}` : ''} readOnly />
            </Row>
          </div>

          {quote && (
            <>
              {quote.premature && (
                <div className="notice error" style={{ marginTop: 14 }}>
                  This is a premature closure — the deposit matures on {fmtDate(quote.deposit.maturityDate)}.
                  The interest below is worked out at the card rate for the time it actually ran; change it if
                  the branch applies a penalty.
                </div>
              )}

              <div className="stat-grid" style={{ marginTop: 14 }}>
                <Stat label="Deposit" value={fmtMoney(quote.deposit.depositAmount)} />
                <Stat label="Interest payable" value={fmtMoney(quote.interestPayable)} />
                <Stat label="Already paid" value={fmtMoney(quote.interestAlreadyPaid)} />
                <Stat label="Payable now" value={fmtMoney(payable)} />
              </div>

              <div className="frm" style={{ marginTop: 18 }}>
                <Row label="Scheme">
                  <input value={quote.deposit.schemeName || quote.deposit.schemeCode} readOnly />
                </Row>
                <Row label="Period / ROI">
                  <input value={`${quote.deposit.periodMonths} months · ${quote.deposit.interestRate}%`} readOnly />
                </Row>

                <Row label="Maturity Date">
                  <input value={fmtDate(quote.deposit.maturityDate)} readOnly />
                </Row>
                <Row label="Maturity Amount">
                  <input value={fmtMoney(quote.deposit.maturityAmount)} readOnly />
                </Row>

                <Row label="Trans. Date">
                  <input type="date" value={form.transDate} onChange={set('transDate')} />
                </Row>
                <Row label="Principal Payable">
                  <input type="number" step="0.01" value={form.principalPayable} onChange={set('principalPayable')} />
                </Row>

                <Row label="Interest Payable">
                  <input type="number" step="0.01" value={form.interestPayable} onChange={set('interestPayable')} />
                </Row>
                <Row label="TDS">
                  <input type="number" step="0.01" value={form.tds} onChange={set('tds')} />
                </Row>

                <Row label="Amount Payable">
                  <input value={fmtMoney(payable)} readOnly />
                </Row>
                <Row label="Paid through">
                  <select value={form.glCode} onChange={set('glCode')}>
                    {glAccounts.map((g) => (
                      <option key={g.code} value={g.code}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </Row>

                <Row label="Narration" span={3}>
                  <input value={form.narration} onChange={set('narration')} />
                </Row>
              </div>
            </>
          )}
        </div>

        <div className="master-foot">
          <button type="button" className="btn ghost" onClick={() => navigate('fd-list')} disabled={busy}>
            Close
          </button>
          <button className="btn danger" type="submit" disabled={busy || !quote}>
            {busy ? 'Closing…' : 'Close the deposit'}
          </button>
        </div>
      </div>
    </form>
  )
}

/* --------------------------------------------------------------- renewal */

export function FdRenewal({ navigate, accNo: initialAccNo }) {
  const [accNo, setAccNo] = useState(initialAccNo || '')
  const [quote, setQuote] = useState(null)
  const [defs, setDefs] = useState(null)
  const [form, setForm] = useState({
    transDate: today(), principalPayable: '', interestPayable: '', tds: '',
    additionalAmount: '', withdrawalAmount: '',
    periodMonths: '12', interestRate: '', interestRepayment: '', narration: '',
  })
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const [busy, setBusy] = useState(false)
  const accRef = useRef(null)

  useEffect(() => {
    api
      .get('/deposits/new')
      .then(setDefs)
      .catch(() => {})
  }, [])

  const lookup = useCallback(async (no) => {
    const v = String(no || '').trim()
    if (!v) return
    try {
      const { deposit } = await api.get(`/deposits/lookup/${encodeURIComponent(v)}`)
      if (deposit.status === 'C') {
        setQuote(null)
        setError(`${deposit.accNo} was already closed on ${fmtDate(deposit.closedDate)}.`)
        return
      }
      const q = await api.get(`/deposits/${deposit.id}/closure-quote`)
      setQuote(q)
      setAccNo(deposit.accNo)
      setForm((f) => ({
        ...f,
        principalPayable: String(q.principalPayable),
        interestPayable: String(q.interestPayable),
        tds: String(q.tds),
        periodMonths: String(deposit.periodMonths),
        interestRate: String(deposit.interestRate),
        interestRepayment: deposit.interestRepayment,
      }))
      setError('')
    } catch (e) {
      setQuote(null)
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    if (initialAccNo) lookup(initialAccNo)
    else accRef.current?.focus()
  }, [initialAccNo, lookup])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const renewal = r2(
    n(form.principalPayable) + n(form.interestPayable) - n(form.tds) + n(form.additionalAmount) -
      n(form.withdrawalAmount)
  )

  async function renew(e) {
    e.preventDefault()
    if (!quote) return
    setBusy(true)
    setError('')
    try {
      const r = await api.post(`/deposits/${quote.deposit.id}/renew`, {
        transDate: form.transDate,
        principalPayable: n(form.principalPayable),
        interestPayable: n(form.interestPayable),
        tds: n(form.tds),
        additionalAmount: n(form.additionalAmount),
        withdrawalAmount: n(form.withdrawalAmount),
        periodMonths: n(form.periodMonths),
        interestRate: n(form.interestRate),
        interestRepayment: form.interestRepayment,
        narration: form.narration,
      })
      setDone(r)
    } catch (e2) {
      setError(e2.message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="master">
        <div className="card">
          <header className="master-head">
            <div>
              <h2>Renewed</h2>
              <p className="muted">
                {done.closed.accNo} → {done.opened.accNo}
              </p>
            </div>
          </header>
          <div className="master-body">
            <div className="notice success">
              {fmtMoney(done.renewalAmount)} carried into {done.opened.accNo}, maturing{' '}
              {fmtDate(done.opened.maturityDate)} at {fmtMoney(done.opened.maturityAmount)}.
              {done.withdrawn > 0 && ` ${fmtMoney(done.withdrawn)} was taken out.`}
            </div>
          </div>
          <div className="master-foot">
            <button className="btn ghost" onClick={() => navigate('fd-view', { id: done.closed.id })}>
              The old deposit
            </button>
            <button className="btn primary" onClick={() => navigate('fd-view', { id: done.opened.id })}>
              The new deposit
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form className="master" onSubmit={renew}>
      <div className="card">
        <header className="master-head">
          <div>
            <h2>FD Renewal</h2>
            <p className="muted">
              {quote ? `${quote.deposit.accNo} · ${quote.deposit.customerName}` : 'Find the deposit to renew'}
            </p>
          </div>
          <div className="master-head-right">
            <span className="master-date">{fmtDate(new Date())}</span>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <div className="frm">
            <Row label="Account No" req>
              <div className="input-with-btn">
                <input
                  ref={accRef}
                  className="mono"
                  value={accNo}
                  onChange={(e) => setAccNo(e.target.value)}
                  onBlur={(e) => lookup(e.target.value)}
                  placeholder="201300001"
                />
                <button type="button" className="btn ghost" onClick={() => lookup(accNo)}>
                  View Details
                </button>
              </div>
            </Row>
            <Row label="Customer">
              <input value={quote ? `${quote.deposit.custId} / ${quote.deposit.customerName}` : ''} readOnly />
            </Row>
          </div>

          {quote && (
            <>
              <Sep>What comes out of the old one</Sep>
              <div className="frm">
                <Row label="Principal Payable">
                  <input type="number" step="0.01" value={form.principalPayable} onChange={set('principalPayable')} />
                </Row>
                <Row label="Interest Payable">
                  <input type="number" step="0.01" value={form.interestPayable} onChange={set('interestPayable')} />
                </Row>
                <Row label="TDS">
                  <input type="number" step="0.01" value={form.tds} onChange={set('tds')} />
                </Row>
                <Row label="Trans. Date">
                  <input type="date" value={form.transDate} onChange={set('transDate')} />
                </Row>
              </div>

              <Sep>What goes into the new one</Sep>
              <div className="frm">
                <Row label="Additional Amount">
                  <input type="number" step="0.01" value={form.additionalAmount} onChange={set('additionalAmount')} />
                </Row>
                <Row label="Withdrawal Amount">
                  <input type="number" step="0.01" value={form.withdrawalAmount} onChange={set('withdrawalAmount')} />
                </Row>

                <Row label="Renewal Amount">
                  <input value={fmtMoney(renewal)} readOnly />
                </Row>
                <Row label="Period (months)">
                  <input className="w-sm" type="number" value={form.periodMonths} onChange={set('periodMonths')} />
                </Row>

                <Row label="Interest Rate %">
                  <input className="w-sm" type="number" step="0.01" value={form.interestRate} onChange={set('interestRate')} />
                </Row>
                <Row label="Interest Repayment">
                  <select value={form.interestRepayment} onChange={set('interestRepayment')}>
                    <option value="1A">1A-Monthly</option>
                    <option value="3A">3A-Quarterly</option>
                    <option value="M">M-On Maturity</option>
                  </select>
                </Row>

                <Row label="Narration" span={3}>
                  <input value={form.narration} onChange={set('narration')} />
                </Row>
              </div>

              {renewal <= 0 && (
                <p className="notice error" style={{ marginTop: 12 }}>
                  Nothing would be left to put into the new deposit.
                </p>
              )}
            </>
          )}
        </div>

        <div className="master-foot">
          <button type="button" className="btn ghost" onClick={() => navigate('fd-list')} disabled={busy}>
            Close
          </button>
          <button className="btn primary" type="submit" disabled={busy || !quote || renewal <= 0}>
            {busy ? 'Renewing…' : 'Renew'}
          </button>
        </div>
      </div>
    </form>
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

function Sep({ children }) {
  return (
    <div className="frm-sep">
      <span>{children}</span>
    </div>
  )
}
