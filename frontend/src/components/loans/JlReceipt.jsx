import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate, fmtMoney } from '../../lib/format.js'

// JL_Receipt.aspx rebuilt. Type the account number, the screen fills in what
// the loan owes today, and the amount received is split across those dues in
// the order they are cleared. Every box in the split can still be overridden.

const n = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? 0 : Number(v))
const r2 = (v) => Math.round(n(v) * 100) / 100
const today = () => new Date().toISOString().slice(0, 10)

const BLANK_SPLIT = { principal: '', interest: '', penal: '', insurance: '', notice: '' }

export default function JlReceipt({ navigate, accNo: initialAccNo }) {
  const [accNo, setAccNo] = useState(initialAccNo || '')
  const [loan, setLoan] = useState(null)
  const [dues, setDues] = useState(null)
  const [glAccounts, setGlAccounts] = useState([])

  const [transDate, setTransDate] = useState(today())
  const [amount, setAmount] = useState('')
  const [rebate, setRebate] = useState('')
  const [split, setSplit] = useState(BLANK_SPLIT)
  const [touched, setTouched] = useState(false) // has the clerk overridden the split?
  const [glCode, setGlCode] = useState('')
  const [preClosure, setPreClosure] = useState(false)
  const [narration, setNarration] = useState('')

  const [error, setError] = useState('')
  const [saved, setSaved] = useState(null) // the receipt just written
  const [busy, setBusy] = useState(false)
  const accRef = useRef(null)

  useEffect(() => {
    api
      .get('/loans/jewel/new')
      .then((d) => {
        setGlAccounts(d.glAccounts)
        setGlCode((c) => c || d.glAccounts[0]?.code || '')
      })
      .catch(() => {})
  }, [])

  const fetchLoan = useCallback(
    async (no, onDate) => {
      const v = String(no || '').trim()
      if (!v) return
      try {
        const r = await api.get(`/loans/jewel/lookup/${encodeURIComponent(v)}?asOn=${onDate}`)
        setLoan(r.loan)
        setDues(r.dues)
        setAccNo(r.loan.accNo)
        setError(r.loan.status === 'C' ? 'This loan is already closed.' : '')
        // Nothing typed yet, so offer the full closing amount, as the old
        // screen did when you landed on a loan.
        setAmount((a) => (a === '' ? String(r.dues.closingAmount) : a))
      } catch (e) {
        setLoan(null)
        setDues(null)
        setError(e.message)
      }
    },
    []
  )

  useEffect(() => {
    if (initialAccNo) fetchLoan(initialAccNo, today())
    else accRef.current?.focus()
  }, [initialAccNo, fetchLoan])

  // Re-ask the server for the split whenever the amount, the rebate or the
  // date moves — the apportionment is its decision, not the screen's.
  useEffect(() => {
    if (!loan || touched) return
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ asOn: transDate, amount: String(n(amount)), rebate: String(n(rebate)) })
        const r = await api.get(`/loans/jewel/${loan.id}/dues?${qs}`)
        setDues(r.dues)
        setSplit({
          principal: String(r.split.principal),
          interest: String(r.split.interest),
          penal: String(r.split.penal),
          insurance: String(r.split.insurance),
          notice: String(r.split.notice),
        })
      } catch (e) {
        setError(e.message)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [loan, amount, rebate, transDate, touched])

  // Drawn before a loan is found, so every field reads through a stand-in.
  const l = loan || {}
  const d = dues || {}
  const ready = !!(loan && dues)

  const splitTotal = r2(
    n(split.principal) + n(split.interest) + n(split.penal) + n(split.insurance) + n(split.notice)
  )
  const closing = dues ? r2(dues.principalDue - n(split.principal)) : 0

  const setPart = (k) => (e) => {
    setTouched(true)
    setSplit((s) => ({ ...s, [k]: e.target.value }))
  }

  function resetSplit() {
    setTouched(false)
  }

  async function save(e) {
    e.preventDefault()
    if (!loan) {
      setError('Enter a valid account number first.')
      return
    }
    if (splitTotal <= 0) {
      setError('Enter an amount to receive.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const r = await api.post(`/loans/jewel/${loan.id}/receipts`, {
        transDate,
        glCode,
        rebate: n(rebate),
        preClosure,
        narration,
        principal: n(split.principal),
        interest: n(split.interest),
        penal: n(split.penal),
        insurance: n(split.insurance),
        notice: n(split.notice),
      })
      setSaved(r.receipt)
      setLoan(r.loan)
    } catch (e2) {
      setError(e2.message)
    } finally {
      setBusy(false)
    }
  }

  function another() {
    setSaved(null)
    setLoan(null)
    setDues(null)
    setAccNo('')
    setAmount('')
    setRebate('')
    setSplit(BLANK_SPLIT)
    setTouched(false)
    setNarration('')
    setPreClosure(false)
    setTimeout(() => accRef.current?.focus(), 0)
  }

  if (saved) {
    return (
      <div className="master">
        <div className="card">
          <header className="master-head">
            <div>
              <h2>Receipt {saved.transId}</h2>
              <p className="muted">
                {saved.customerName} · {saved.accNo} · {fmtDate(saved.transDate)}
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
              {fmtMoney(saved.amount)} received.
              {saved.closedLoan
                ? ' The loan is now closed — release the jewels.'
                : ` Balance ${fmtMoney(saved.closingBalance)}.`}
            </div>
            <div className="frm">
              <Row label="Principal">{fmtMoney(saved.principal)}</Row>
              <Row label="Interest">{fmtMoney(saved.interest)}</Row>
              <Row label="Penal">{fmtMoney(saved.penal)}</Row>
              <Row label="Insurance">{fmtMoney(saved.insurance)}</Row>
              <Row label="Notice">{fmtMoney(saved.notice)}</Row>
              <Row label="Rebate allowed">{fmtMoney(saved.rebate)}</Row>
              <Row label="Interest paid up to">{fmtDate(saved.intUpto)}</Row>
              <Row label="Closing balance">{fmtMoney(saved.closingBalance)}</Row>
            </div>
          </div>
          <div className="master-foot">
            <button className="btn ghost" onClick={() => navigate('jl-view', { id: saved.loan })}>
              Open the loan
            </button>
            <button className="btn primary" onClick={another}>
              Another receipt
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
            <h2>JL Receipt</h2>
            <p className="muted">{loan ? `${loan.accNo} · ${loan.customerName}` : 'Find the loan to collect against'}</p>
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
                  onBlur={(e) => fetchLoan(e.target.value, transDate)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      fetchLoan(accNo, transDate)
                    }
                  }}
                  placeholder="201600367"
                />
                <button type="button" className="btn ghost" onClick={() => fetchLoan(accNo, transDate)}>
                  View Details
                </button>
              </div>
            </Row>
            <Row label="Trans. Date">
              <input
                type="date"
                value={transDate}
                onChange={(e) => {
                  setTransDate(e.target.value)
                  setTouched(false)
                  if (loan) fetchLoan(loan.accNo, e.target.value)
                }}
              />
            </Row>
          </div>

          {(
            <>
              <div className="frm">
                <Row label="Customer">{ready ? `${l.customerName} · ${l.custId}` : '—'}</Row>
                <Row label="Scheme">{l.schemeCode || '—'}</Row>
                <Row label="Open / Due">
                  {ready ? `${fmtDate(l.openDate)} — ${fmtDate(l.dueDate)}` : '—'}
                </Row>
                <Row label="Rate">{ready ? `${l.interestRate}% + ${l.penalRate}% penal` : '—'}</Row>
                <Row label="Interest paid up to">{fmtDate(d.intFrom) || '—'}</Row>
                <Row label="Interest charged for">{ready ? `${d.interestMonths} months` : '—'}</Row>
              </div>

              <Sep>{ready ? `What is owed on ${fmtDate(d.asOn)}` : 'What is owed'}</Sep>
              <div className="stat-grid">
                <Stat label="Principal" value={fmtMoney(d.principalDue)} />
                <Stat label="Interest" value={fmtMoney(d.interestDue)} />
                <Stat label="Penal" value={fmtMoney(d.penalDue)} />
                <Stat label="Insurance" value={fmtMoney(d.insuranceDue)} />
                <Stat label="Notice" value={fmtMoney(d.noticeDue)} />
                <Stat label="To close" value={fmtMoney(d.closingAmount)} />
              </div>

              <Sep>Received</Sep>
              <div className="frm">
                <Row label="Amount" req>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value)
                      setTouched(false)
                    }}
                    disabled={!ready}
                  />
                </Row>
                <Row label="Interest rebate">
                  <input
                    type="number"
                    step="0.01"
                    value={rebate}
                    onChange={(e) => {
                      setRebate(e.target.value)
                      setTouched(false)
                    }}
                    disabled={!ready}
                  />
                </Row>

                <Row label="Principal">
                  <input type="number" step="0.01" value={split.principal} onChange={setPart('principal')} />
                </Row>
                <Row label="Interest">
                  <input type="number" step="0.01" value={split.interest} onChange={setPart('interest')} />
                </Row>

                <Row label="Penal">
                  <input type="number" step="0.01" value={split.penal} onChange={setPart('penal')} />
                </Row>
                <Row label="Insurance">
                  <input type="number" step="0.01" value={split.insurance} onChange={setPart('insurance')} />
                </Row>

                <Row label="Notice charges">
                  <input type="number" step="0.01" value={split.notice} onChange={setPart('notice')} />
                </Row>
                <Row label="Total received">
                  <input value={fmtMoney(splitTotal)} readOnly />
                </Row>

                <Row label="Closing balance">
                  <input value={fmtMoney(closing)} readOnly />
                </Row>
                <Row label="Received into">
                  <select value={glCode} onChange={(e) => setGlCode(e.target.value)} disabled={!ready}>
                    {glAccounts.map((g) => (
                      <option key={g.code} value={g.code}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </Row>

                <Row label="Pre-closure">
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={preClosure}
                      onChange={(e) => setPreClosure(e.target.checked)}
                      disabled={!ready}
                    />
                    Closed before the due date
                  </label>
                </Row>
                <Row label="Narration">
                  <input value={narration} onChange={(e) => setNarration(e.target.value)} disabled={!ready} />
                </Row>
              </div>

              {!ready && (
                <p className="muted" style={{ marginTop: 12 }}>
                  The collection boxes open once a loan is found.
                </p>
              )}

              {touched && (
                <p className="muted" style={{ marginTop: 10 }}>
                  The split has been changed by hand.{' '}
                  <button type="button" className="btn tiny ghost" onClick={resetSplit}>
                    Work it out again
                  </button>
                </p>
              )}
            </>
          )}
        </div>

        <div className="master-foot">
          <button type="button" className="btn ghost" onClick={() => navigate('jl-list')} disabled={busy}>
            Close
          </button>
          <button className="btn primary" type="submit" disabled={busy || !loan || loan.status === 'C'}>
            {busy ? 'Saving…' : 'Save receipt'}
          </button>
        </div>
      </div>
    </form>
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

function Sep({ children }) {
  return (
    <div className="frm-sep">
      <span>{children}</span>
    </div>
  )
}
