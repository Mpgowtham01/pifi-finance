import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate, fmtMoney } from '../../lib/format.js'

// Journal.aspx rebuilt. The old app served all three Vouchers menu entries
// from this one screen, telling them apart by a PT query string: a journal is
// free on both sides, a payment voucher comes out of cash, a receipt voucher
// goes into it. Same here — one component, a `kind` of JNL, VP or VR.
//
// The "+" button on the old screen opened a panel for carrying part of the
// entry against a customer's own account. It is the "Against accounts"
// section below.

const n = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? 0 : Number(v))

const CLOSE_TO = 'dashboard'

export default function VoucherEntry({ navigate, kind = 'JNL' }) {
  const [meta, setMeta] = useState(null)
  const [form, setForm] = useState({
    debitGlCode: '',
    debitGlName: '',
    creditGlCode: '',
    creditGlName: '',
    amount: '',
    narration: '',
  })
  const [allocations, setAllocations] = useState([])
  const [showAlloc, setShowAlloc] = useState(false)
  const [draft, setDraft] = useState({ accNo: '', amount: '', type: 'Credit' })
  const [draftAccount, setDraftAccount] = useState(null)
  const [draftError, setDraftError] = useState('')
  const [picking, setPicking] = useState(null) // 'debit' | 'credit'
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(null)
  const [busy, setBusy] = useState(false)
  const firstRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const d = await api.get(`/vouchers/new?type=${encodeURIComponent(kind)}`)
      setMeta(d)
      setForm({
        debitGlCode: d.debitGlCode,
        debitGlName: d.debitGlName,
        creditGlCode: d.creditGlCode,
        creditGlName: d.creditGlName,
        amount: '',
        narration: '',
      })
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [kind])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    firstRef.current?.focus()
  }, [kind])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // Typing a GL code and leaving the box fills its name in, which is what the
  // old screen's hidden Button3/Button1 post-back did.
  const resolveGl = useCallback(async (side, code) => {
    const v = String(code || '').trim()
    const nameKey = `${side}GlName`
    if (!v) {
      setForm((f) => ({ ...f, [nameKey]: '' }))
      return
    }
    try {
      const { glAccount } = await api.get(`/vouchers/gl/${encodeURIComponent(v)}`)
      setForm((f) => ({ ...f, [`${side}GlCode`]: glAccount.code, [nameKey]: glAccount.name }))
      setError('')
    } catch (e) {
      setForm((f) => ({ ...f, [nameKey]: '' }))
      setError(e.message)
    }
  }, [])

  function pickGl(gl) {
    const side = picking
    setPicking(null)
    setForm((f) => ({ ...f, [`${side}GlCode`]: gl.code, [`${side}GlName`]: gl.name }))
    setError('')
  }

  /* ------------------------------------------------- the against-accounts rows */

  const findDraftAccount = useCallback(async (no) => {
    const v = String(no || '').trim()
    if (!v) {
      setDraftAccount(null)
      return
    }
    try {
      const { account } = await api.get(`/vouchers/account/${encodeURIComponent(v)}`)
      setDraftAccount(account)
      setDraft((d) => ({ ...d, accNo: account.accNo }))
      setDraftError('')
    } catch (e) {
      setDraftAccount(null)
      setDraftError(e.message)
    }
  }, [])

  function addAllocation() {
    if (!draftAccount) return setDraftError('Find the account first.')
    if (n(draft.amount) <= 0) return setDraftError('Enter an amount for this account.')
    if (allocations.some((a) => a.accNo === draftAccount.accNo)) {
      return setDraftError(`${draftAccount.accNo} is already on this voucher.`)
    }
    setAllocations((rows) => [
      ...rows,
      {
        accNo: draftAccount.accNo,
        accType: draftAccount.accType,
        custId: draftAccount.custId,
        customerName: draftAccount.customerName,
        type: draft.type,
        amount: n(draft.amount),
      },
    ])
    setDraft({ accNo: '', amount: '', type: 'Credit' })
    setDraftAccount(null)
    setDraftError('')
  }

  const allocated = Math.round(allocations.reduce((t, a) => t + a.amount, 0) * 100) / 100
  const amount = n(form.amount)
  const splitMismatch = allocations.length > 0 && allocated !== Math.round(amount * 100) / 100

  /* -------------------------------------------------------------------- save */

  async function save(e) {
    e.preventDefault()
    if (!form.debitGlCode.trim()) return setError('Pick the debit account.')
    if (!form.creditGlCode.trim()) return setError('Pick the credit account.')
    if (form.debitGlCode.trim() === form.creditGlCode.trim()) {
      return setError('The two sides have to be different accounts.')
    }
    if (amount <= 0) return setError('Enter an amount.')
    setBusy(true)
    setError('')
    try {
      const r = await api.post('/vouchers', {
        voucherType: kind,
        debitGlCode: form.debitGlCode.trim(),
        creditGlCode: form.creditGlCode.trim(),
        amount,
        narration: form.narration,
        allocations,
      })
      setSaved(r.voucher)
    } catch (e2) {
      setError(e2.message)
    } finally {
      setBusy(false)
    }
  }

  async function again() {
    setSaved(null)
    setAllocations([])
    setShowAlloc(false)
    setDraft({ accNo: '', amount: '', type: 'Credit' })
    setDraftAccount(null)
    await load()
    firstRef.current?.focus()
  }

  const title = meta?.title || { JNL: 'Journal', VP: 'Voucher Payment', VR: 'Voucher Receipt' }[kind]

  if (saved) return <VoucherSaved voucher={saved} navigate={navigate} onAgain={again} />

  return (
    <form className="master" onSubmit={save}>
      <div className="card">
        <header className="master-head">
          <div>
            <h2>{title}</h2>
            <p className="muted">
              {kind === 'VP'
                ? 'Money paid out — the credit side is cash unless you change it'
                : kind === 'VR'
                  ? 'Money taken in — the debit side is cash unless you change it'
                  : 'A ledger entry made by hand, free on both sides'}
            </p>
          </div>
          <div className="master-head-right">
            <span className="master-date">{fmtDate(meta?.transDate || new Date())}</span>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <div className="frm">
            <Row label="Transaction Id">
              <input className="mono w-sm" value={meta?.transId || ''} readOnly tabIndex={-1} />
            </Row>
            <Row label="Transaction Date">
              <input value={fmtDate(meta?.transDate)} readOnly tabIndex={-1} />
            </Row>

            <Row label="Debit Account" req>
              <GlBox
                inputRef={firstRef}
                value={form.debitGlCode}
                onChange={set('debitGlCode')}
                onResolve={(v) => resolveGl('debit', v)}
                onSearch={() => setPicking('debit')}
              />
            </Row>
            <Row label="Acc. Name">
              <input value={form.debitGlName} readOnly tabIndex={-1} />
            </Row>

            <Row label="Credit Account" req>
              <GlBox
                value={form.creditGlCode}
                onChange={set('creditGlCode')}
                onResolve={(v) => resolveGl('credit', v)}
                onSearch={() => setPicking('credit')}
              />
            </Row>
            <Row label="Acc. Name">
              <input value={form.creditGlName} readOnly tabIndex={-1} />
            </Row>

            <Row label="Transaction Amount" req>
              <input type="number" step="0.01" value={form.amount} onChange={set('amount')} />
            </Row>
            <Row label="In words">
              <input value={amount > 0 ? inWords(amount) : ''} readOnly tabIndex={-1} />
            </Row>

            <Row label="Narration" span={3}>
              <input value={form.narration} onChange={set('narration')} />
            </Row>
          </div>

          <div className="frm-sep">
            <span>
              Against accounts
              <button
                type="button"
                className="btn tiny ghost"
                style={{ marginLeft: 10 }}
                onClick={() => setShowAlloc((v) => !v)}
              >
                {showAlloc ? '− Hide' : '+ Show'}
              </button>
            </span>
          </div>

          {!showAlloc && allocations.length === 0 && (
            <p className="muted">
              Leave this shut for a plain ledger entry. Open it to carry the voucher against a customer&apos;s own
              savings, deposit, loan or share account.
            </p>
          )}

          {showAlloc && (
            <>
              {draftError && <div className="notice error">{draftError}</div>}
              <div className="frm">
                <Row label="Account Number">
                  <div className="input-with-btn">
                    <input
                      className="mono"
                      value={draft.accNo}
                      onChange={(e) => setDraft((d) => ({ ...d, accNo: e.target.value }))}
                      onBlur={(e) => findDraftAccount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          findDraftAccount(draft.accNo)
                        }
                      }}
                      placeholder="201200209"
                    />
                    <button type="button" className="btn ghost" onClick={() => findDraftAccount(draft.accNo)}>
                      Search
                    </button>
                  </div>
                </Row>
                <Row label="Customer Info">
                  <input
                    value={draftAccount ? `${draftAccount.custId} / ${draftAccount.customerName}` : ''}
                    readOnly
                    tabIndex={-1}
                  />
                </Row>

                <Row label="Trans. Amount">
                  <input
                    type="number"
                    step="0.01"
                    value={draft.amount}
                    onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                  />
                </Row>
                <Row label="Transaction Type">
                  <div className="input-with-btn">
                    <select
                      value={draft.type}
                      onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
                    >
                      <option value="Credit">Credit</option>
                      <option value="Debit">Debit</option>
                    </select>
                    <button type="button" className="btn" onClick={addAllocation}>
                      Add
                    </button>
                  </div>
                </Row>
              </div>

              {draftAccount && (
                <p className="muted" style={{ marginTop: 10 }}>
                  {draftAccount.accType} · {draftAccount.scheme || '—'} · balance {fmtMoney(draftAccount.balance)}
                  {draftAccount.status === 'Closed' && ' · closed'}
                </p>
              )}
            </>
          )}

          {allocations.length > 0 && (
            <>
              <div className="table-wrap" style={{ marginTop: 16 }}>
                <table className="grid">
                  <thead>
                    <tr>
                      <th style={{ width: 130 }}>Acc. No</th>
                      <th style={{ width: 130 }}>Type</th>
                      <th>Customer</th>
                      <th style={{ width: 90 }}>Cr / Dr</th>
                      <th className="right-align" style={{ width: 130 }}>
                        Amount
                      </th>
                      <th style={{ width: 80 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((a) => (
                      <tr key={a.accNo}>
                        <td className="mono">{a.accNo}</td>
                        <td>{a.accType}</td>
                        <td>
                          {a.customerName}
                          <small className="muted"> · {a.custId}</small>
                        </td>
                        <td>{a.type}</td>
                        <td className="right-align">{fmtMoney(a.amount)}</td>
                        <td className="right-align">
                          <button
                            type="button"
                            className="btn tiny ghost"
                            onClick={() => setAllocations((rows) => rows.filter((r) => r.accNo !== a.accNo))}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={4}>Allocated</th>
                      <th className="right-align">{fmtMoney(allocated)}</th>
                      <th />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {splitMismatch && (
                <p className="notice error" style={{ marginTop: 12 }}>
                  The account rows come to {fmtMoney(allocated)}, but the voucher is for {fmtMoney(amount)}. A split
                  has to add up to the voucher.
                </p>
              )}
            </>
          )}
        </div>

        <div className="master-foot">
          <button type="button" className="btn ghost" onClick={() => navigate(CLOSE_TO)} disabled={busy}>
            Close
          </button>
          <button className="btn primary" type="submit" disabled={busy || splitMismatch}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {picking && (
        <GlPicker
          title={picking === 'debit' ? 'Find the debit account' : 'Find the credit account'}
          onPick={pickGl}
          onClose={() => setPicking(null)}
        />
      )}
    </form>
  )
}

/* ------------------------------------------------------------ the saved voucher */

function VoucherSaved({ voucher, navigate, onAgain }) {
  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>
              {voucher.title} {voucher.transId}
            </h2>
            <p className="muted">{fmtDate(voucher.transDate)}</p>
          </div>
          <div className="master-head-right">
            <button className="btn" onClick={() => window.print()}>
              Print
            </button>
          </div>
        </header>

        <div className="master-body">
          <div className="notice success">{fmtMoney(voucher.amount)} posted.</div>

          <div className="frm" style={{ marginTop: 18 }}>
            <Row label="Debit">
              <input value={`${voucher.debitGlCode} · ${voucher.debitGlName}`} readOnly tabIndex={-1} />
            </Row>
            <Row label="Credit">
              <input value={`${voucher.creditGlCode} · ${voucher.creditGlName}`} readOnly tabIndex={-1} />
            </Row>
            <Row label="Amount">
              <input value={fmtMoney(voucher.amount)} readOnly tabIndex={-1} />
            </Row>
            <Row label="Narration">
              <input value={voucher.narration || '—'} readOnly tabIndex={-1} />
            </Row>
          </div>

          {voucher.allocations.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 18 }}>
              <table className="grid">
                <thead>
                  <tr>
                    <th style={{ width: 130 }}>Acc. No</th>
                    <th>Customer</th>
                    <th style={{ width: 90 }}>Cr / Dr</th>
                    <th className="right-align" style={{ width: 130 }}>
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {voucher.allocations.map((a) => (
                    <tr key={a.accNo}>
                      <td className="mono">{a.accNo}</td>
                      <td>
                        {a.customerName}
                        <small className="muted"> · {a.accType}</small>
                      </td>
                      <td>{a.type}</td>
                      <td className="right-align">{fmtMoney(a.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="master-foot">
          <button className="btn ghost" onClick={() => navigate(CLOSE_TO)}>
            Close
          </button>
          <button className="btn primary" onClick={onAgain}>
            Another voucher
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- pieces */

// A GL code box with the old screen's Search button beside it.
function GlBox({ inputRef, value, onChange, onResolve, onSearch }) {
  return (
    <div className="input-with-btn">
      <input
        ref={inputRef}
        className="mono"
        value={value}
        maxLength={10}
        onChange={onChange}
        onBlur={(e) => onResolve(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onResolve(e.currentTarget.value)
          }
        }}
        placeholder="29000"
      />
      <button type="button" className="btn ghost" onClick={onSearch}>
        Search
      </button>
    </div>
  )
}

// The old screen's modal grid of GL heads, same flow as the customer picker.
function GlPicker({ title, onPick, onClose }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const t = setTimeout(async () => {
      setBusy(true)
      setError('')
      try {
        const r = await api.get(`/vouchers/gl?q=${encodeURIComponent(q.trim())}`)
        setRows(r.glAccounts)
      } catch (e) {
        setError(e.message)
      } finally {
        setBusy(false)
      }
    }, 220)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">{title}</div>
        <div className="modal-body">
          <div className="search">
            <input
              ref={inputRef}
              placeholder="GL code or name…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && onClose()}
            />
          </div>
          {error && (
            <div className="notice error" style={{ marginTop: 12 }}>
              {error}
            </div>
          )}
          <div className="picker-results">
            {!busy && rows.length === 0 && !error && <p className="muted">No match.</p>}
            {rows.map((g) => (
              <button key={g.code} type="button" className="picker-row" onClick={() => onPick(g)}>
                <span className="picker-id">{g.code}</span>
                <span className="picker-name">
                  {g.name}
                  <small className="muted">
                    {[g.category, g.schedule].filter(Boolean).join(' · ') || '—'}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
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

/* ------------------------------------------------------------ amount in words */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

const under100 = (v) => (v < 20 ? ONES[v] : `${TENS[Math.floor(v / 10)]}${v % 10 ? ` ${ONES[v % 10]}` : ''}`)

// Lakhs and crores, the way a voucher is written out by hand here.
function inWords(value) {
  const whole = Math.floor(Math.abs(value))
  const paise = Math.round((Math.abs(value) - whole) * 100)
  if (whole === 0 && paise === 0) return 'Zero'
  const parts = []
  const push = (v, unit) => v > 0 && parts.push(`${under100(v)} ${unit}`)
  push(Math.floor(whole / 10000000), 'Crore')
  push(Math.floor((whole % 10000000) / 100000), 'Lakh')
  push(Math.floor((whole % 100000) / 1000), 'Thousand')
  push(Math.floor((whole % 1000) / 100), 'Hundred')
  const rest = whole % 100
  if (rest > 0) parts.push(under100(rest))
  let out = parts.join(' ')
  if (paise > 0) out += `${out ? ' and ' : ''}${under100(paise)} Paise`
  return out
}
