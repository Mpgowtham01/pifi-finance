import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate, fmtMoney } from '../../lib/format.js'

// One savings account in full, the counter transaction screen, and the
// closure — SB_Tran.aspx and SB_Closure.aspx rebuilt.

const today = () => new Date().toISOString().slice(0, 10)
const n = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? 0 : Number(v))

/* ------------------------------------------------------------ one account */

export function SavingsView({ navigate, id, session }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [cancelling, setCancelling] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await api.get(`/savings/${id}`))
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
      await api.post(`/savings/transactions/${cancelling.id}/cancel`, { reason })
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

  const { account: a, customer, transactions } = data
  const isAdmin = session?.user?.role === 'admin'

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>
              {a.accNo}{' '}
              <span className={`badge ${a.status === 'A' ? 'ok' : 'neutral'}`}>
                {a.status === 'A' ? 'Active' : 'Closed'}
              </span>
            </h2>
            <p className="muted">
              {a.customerName} · {a.custId}
              {customer?.mobile ? ` · ${customer.mobile}` : ''}
            </p>
          </div>
          <div className="master-head-right">
            {a.status === 'A' && (
              <>
                <button className="btn primary" onClick={() => navigate('sb-tran', { accNo: a.accNo })}>
                  Transaction
                </button>
                <button className="btn" onClick={() => navigate('sb-closure', { accNo: a.accNo })}>
                  Close a/c
                </button>
              </>
            )}
            <button className="btn ghost" onClick={() => navigate('sb-statement', { accNo: a.accNo })}>
              Statement
            </button>
            {isAdmin && (
              <button className="btn ghost" onClick={() => navigate('sb-edit', { id: a.id })}>
                Edit
              </button>
            )}
            <button className="btn ghost" onClick={() => navigate('sb-list')}>
              Close
            </button>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <div className="stat-grid">
            <Stat label="Balance" value={fmtMoney(a.balance)} />
            <Stat label="Interest rate" value={`${a.interestRate}% a year`} />
            <Stat label="Interest paid up to" value={a.interestUpto ? fmtDate(a.interestUpto) : '—'} />
            <Stat label="Last transaction" value={a.lastTranDate ? fmtDate(a.lastTranDate) : '—'} />
          </div>

          <div className="frm" style={{ marginTop: 18 }}>
            <Row label="Scheme">{a.schemeName || a.schemeCode || '—'}</Row>
            <Row label="Open date">{fmtDate(a.openDate)}</Row>
            <Row label="Mode of operation">{a.mop}</Row>
            <Row label="Joint holders">
              {a.jointNames?.filter(Boolean).length ? a.jointNames.filter(Boolean).join(', ') : '—'}
            </Row>
            <Row label="Minor">
              {a.minor?.name ? `${a.minor.name}${a.minor.dob ? ` · ${fmtDate(a.minor.dob)}` : ''}` : '—'}
            </Row>
            <Row label="Nominee">
              {a.nominee?.name
                ? `${a.nominee.name}${a.nominee.relation ? ` (${a.nominee.relation})` : ''}`
                : '—'}
            </Row>
            {a.status === 'C' && (
              <>
                <Row label="Closed on">{fmtDate(a.closedDate)}</Row>
                <Row label="Closure charges">{fmtMoney(a.closureCharges)}</Row>
              </>
            )}
            {a.narration && (
              <Row label="Narration" span={3}>
                {a.narration}
              </Row>
            )}
          </div>

          <div className="frm-sep">
            <span>Transactions</span>
          </div>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>Trans. Id</th>
                  <th style={{ width: 110 }}>Date</th>
                  <th>Particulars</th>
                  <th className="right-align">Deposit</th>
                  <th className="right-align">Withdrawal</th>
                  <th className="right-align">Balance</th>
                  <th style={{ width: 90 }} className="right-align" />
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted" style={{ padding: 22, textAlign: 'center' }}>
                      Nothing has moved yet.
                    </td>
                  </tr>
                )}
                {transactions.map((t) => (
                  <tr key={t.id} style={t.status === 'cancelled' ? { opacity: 0.55 } : undefined}>
                    <td className="mono">{t.transId}</td>
                    <td>{fmtDate(t.transDate)}</td>
                    <td>
                      {t.narration || (t.type === 'Credit' ? 'Deposit' : 'Withdrawal')}
                      {t.kind === 'interest' && (
                        <span className="badge neutral" style={{ marginLeft: 6 }}>
                          Interest
                        </span>
                      )}
                      {t.status === 'cancelled' && (
                        <span className="badge off" style={{ marginLeft: 6 }}>
                          Cancelled
                        </span>
                      )}
                    </td>
                    <td className="right-align">{t.type === 'Credit' ? fmtMoney(t.amount) : ''}</td>
                    <td className="right-align">{t.type === 'Debit' ? fmtMoney(t.amount) : ''}</td>
                    <td className="right-align">{fmtMoney(t.balance)}</td>
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
            <div className="modal-head">Cancel transaction {cancelling.transId}</div>
            <div className="modal-body">
              <p style={{ marginTop: 0 }}>
                {fmtMoney(cancelling.amount)} on {fmtDate(cancelling.transDate)} goes back. The row stays in the
                book with the reason against it.
              </p>
              <label className="lbl" htmlFor="sb-cancel-reason">
                Reason
              </label>
              <input
                id="sb-cancel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this being reversed?"
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

/* ------------------------------------------------------- the counter screen */

export function SavingsTransactionScreen({ navigate, accNo: initialAccNo }) {
  const [accNo, setAccNo] = useState(initialAccNo || '')
  const [account, setAccount] = useState(null)
  const [glAccounts, setGlAccounts] = useState([])
  const [type, setType] = useState('Credit')
  const [amount, setAmount] = useState('')
  const [transDate, setTransDate] = useState(today())
  const [glCode, setGlCode] = useState('')
  const [narration, setNarration] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(null)
  const [busy, setBusy] = useState(false)
  const accRef = useRef(null)

  useEffect(() => {
    api
      .get('/savings/new')
      .then((d) => {
        setGlAccounts(d.glAccounts)
        setGlCode((c) => c || d.glAccounts[0]?.code || '')
      })
      .catch(() => {})
  }, [])

  const lookup = useCallback(async (no) => {
    const v = String(no || '').trim()
    if (!v) return
    try {
      const { account: a } = await api.get(`/savings/lookup/${encodeURIComponent(v)}`)
      setAccount(a)
      setAccNo(a.accNo)
      setError(a.status === 'C' ? 'This account is closed.' : '')
    } catch (e) {
      setAccount(null)
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    if (initialAccNo) lookup(initialAccNo)
    else accRef.current?.focus()
  }, [initialAccNo, lookup])

  const value = n(amount)
  const after = account ? Math.round((account.balance + (type === 'Credit' ? value : -value)) * 100) / 100 : 0

  async function save(e) {
    e.preventDefault()
    if (!account) return setError('Find the account first.')
    if (value <= 0) return setError('Enter an amount.')
    setBusy(true)
    setError('')
    try {
      const r = await api.post(`/savings/${account.id}/transactions`, {
        type,
        amount: value,
        transDate,
        glCode,
        narration,
      })
      setSaved(r)
      setAccount(r.account)
    } catch (e2) {
      setError(e2.message)
    } finally {
      setBusy(false)
    }
  }

  function again() {
    setSaved(null)
    setAmount('')
    setNarration('')
  }

  if (saved) {
    const t = saved.transaction
    return (
      <div className="master">
        <div className="card">
          <header className="master-head">
            <div>
              <h2>Transaction {t.transId}</h2>
              <p className="muted">
                {t.customerName} · {t.accNo} · {fmtDate(t.transDate)}
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
              {t.type === 'Credit' ? 'Deposit' : 'Withdrawal'} of {fmtMoney(t.amount)} posted. The balance is now{' '}
              {fmtMoney(t.balance)}.
            </div>
          </div>
          <div className="master-foot">
            <button className="btn ghost" onClick={() => navigate('sb-view', { id: saved.account.id })}>
              Open the account
            </button>
            <button className="btn primary" onClick={again}>
              Another transaction
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
            <h2>Savings Transaction</h2>
            <p className="muted">{account ? `${account.accNo} · ${account.customerName}` : 'Find the account'}</p>
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
                  placeholder="201200209"
                />
                <button type="button" className="btn ghost" onClick={() => lookup(accNo)}>
                  View Details
                </button>
              </div>
            </Row>
            <Row label="Customer">
              <input value={account ? `${account.custId} / ${account.customerName}` : ''} readOnly />
            </Row>

            <Row label="Scheme">
              <input value={account?.schemeName || account?.schemeCode || ''} readOnly />
            </Row>
            <Row label="Balance">
              <input value={account ? fmtMoney(account.balance) : ''} readOnly />
            </Row>

            <Row label="Transaction Type" req>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="Credit">Deposit</option>
                <option value="Debit">Withdrawal</option>
              </select>
            </Row>
            <Row label="Transaction Date">
              <input type="date" value={transDate} onChange={(e) => setTransDate(e.target.value)} />
            </Row>

            <Row label="Amount" req>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            </Row>
            <Row label="Balance after">
              <input value={account && value > 0 ? fmtMoney(after) : ''} readOnly />
            </Row>

            <Row label="Mode of Receipt">
              <select value={glCode} onChange={(e) => setGlCode(e.target.value)}>
                {glAccounts.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Narration">
              <input value={narration} onChange={(e) => setNarration(e.target.value)} />
            </Row>
          </div>

          {account && type === 'Debit' && value > account.balance && (
            <p className="notice error" style={{ marginTop: 12 }}>
              There is only {fmtMoney(account.balance)} in this account.
            </p>
          )}
        </div>

        <div className="master-foot">
          <button type="button" className="btn ghost" onClick={() => navigate('sb-list')} disabled={busy}>
            Close
          </button>
          <button className="btn primary" type="submit" disabled={busy || !account || account.status === 'C'}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------- closure */

export function SavingsClosure({ navigate, accNo: initialAccNo }) {
  const [accNo, setAccNo] = useState(initialAccNo || '')
  const [quote, setQuote] = useState(null)
  const [glAccounts, setGlAccounts] = useState([])
  const [form, setForm] = useState({ transDate: today(), interest: '', closureCharges: '', glCode: '', narration: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const [busy, setBusy] = useState(false)
  const accRef = useRef(null)

  useEffect(() => {
    api
      .get('/savings/new')
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
      const { account } = await api.get(`/savings/lookup/${encodeURIComponent(v)}`)
      if (account.status === 'C') {
        setQuote(null)
        setError(`${account.accNo} was already closed on ${fmtDate(account.closedDate)}.`)
        return
      }
      const q = await api.get(`/savings/${account.id}/closure-quote`)
      setQuote(q)
      setAccNo(account.accNo)
      setForm((f) => ({ ...f, interest: String(q.interest) }))
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
  // Drawn before an account is found, so the fields read through a stand-in.
  const q = quote || {}
  const a = quote?.account || {}
  const ready = !!quote
  const payable = ready
    ? Math.round((q.balance + n(form.interest) - n(form.closureCharges)) * 100) / 100
    : 0

  async function close(e) {
    e.preventDefault()
    if (!quote) return
    setBusy(true)
    setError('')
    try {
      const r = await api.post(`/savings/${quote.account.id}/close`, {
        transDate: form.transDate,
        interest: n(form.interest),
        closureCharges: n(form.closureCharges),
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
              <h2>{done.account.accNo} closed</h2>
              <p className="muted">
                {done.account.customerName} · {fmtDate(done.account.closedDate)}
              </p>
            </div>
          </header>
          <div className="master-body">
            <div className="notice success">{fmtMoney(done.paidOut)} paid out. The account is now closed.</div>
          </div>
          <div className="master-foot">
            <button className="btn ghost" onClick={() => navigate('sb-view', { id: done.account.id })}>
              Open the account
            </button>
            <button className="btn primary" onClick={() => navigate('sb-list')}>
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
            <h2>SD Account Closure</h2>
            <p className="muted">
              {quote ? `${quote.account.accNo} · ${quote.account.customerName}` : 'Find the account to close'}
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
                  placeholder="201200209"
                />
                <button type="button" className="btn ghost" onClick={() => lookup(accNo)}>
                  View Details
                </button>
              </div>
            </Row>
            <Row label="Customer">
              <input value={quote ? `${quote.account.custId} / ${quote.account.customerName}` : ''} readOnly />
            </Row>
          </div>

          <div className="stat-grid" style={{ marginTop: 18 }}>
            <Stat label="Balance" value={fmtMoney(q.balance)} />
            <Stat label="Interest since" value={fmtDate(q.interestFrom)} />
            <Stat label="Interest earned" value={fmtMoney(q.interest)} />
            <Stat label="Payable" value={ready ? fmtMoney(payable) : ''} />
          </div>

          <div className="frm" style={{ marginTop: 18 }}>
            <Row label="A/c Open Date">
              <input value={fmtDate(a.openDate)} readOnly />
            </Row>
            <Row label="ROI">
              <input value={ready ? `${a.interestRate}%` : ''} readOnly />
            </Row>

            <Row label="Transaction Date">
              <input type="date" value={form.transDate} onChange={set('transDate')} disabled={!ready} />
            </Row>
            <Row label="Interest">
              <input type="number" step="0.01" value={form.interest} onChange={set('interest')} disabled={!ready} />
            </Row>

            <Row label="Closure Charges">
              <input
                type="number"
                step="0.01"
                value={form.closureCharges}
                onChange={set('closureCharges')}
                disabled={!ready}
              />
            </Row>
            <Row label="Amount payable">
              <input value={ready ? fmtMoney(payable) : ''} readOnly />
            </Row>

            <Row label="Mode of Payment">
              <select value={form.glCode} onChange={set('glCode')} disabled={!ready}>
                {glAccounts.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Narration">
              <input value={form.narration} onChange={set('narration')} disabled={!ready} />
            </Row>
          </div>

          {!ready && (
            <p className="muted" style={{ marginTop: 12 }}>
              The closure boxes open once an account is found.
            </p>
          )}
        </div>

        <div className="master-foot">
          <button type="button" className="btn ghost" onClick={() => navigate('sb-list')} disabled={busy}>
            Close
          </button>
          <button className="btn danger" type="submit" disabled={busy || !quote}>
            {busy ? 'Closing…' : 'Close the account'}
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
