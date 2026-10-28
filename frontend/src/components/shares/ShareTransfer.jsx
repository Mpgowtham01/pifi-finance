import { useEffect, useRef, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate, fmtMoney } from '../../lib/format.js'
import CustomerPicker from '../CustomerPicker.jsx'

// Share_Transfer.aspx rebuilt. Shares move off the end of the holder's run of
// distinctive numbers, so what stays behind is still one unbroken block, and
// the shares that move become a holding — and a certificate — of their own in
// the new member's name.

const n = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? 0 : Number(v))
const r2 = (v) => Math.round(n(v) * 100) / 100
const today = () => new Date().toISOString().slice(0, 10)

export default function ShareTransferScreen({ navigate, accNo: initialAccNo }) {
  const [accNo, setAccNo] = useState(initialAccNo || '')
  const [from, setFrom] = useState(null) // the holding being transferred out of
  const [toCustomer, setToCustomer] = useState(null)
  // The holding the shares land in. A member who holds none yet gets one
  // opened on save, which is what the old screen left blank until then.
  const [toAccNo, setToAccNo] = useState('')
  const [toCustId, setToCustId] = useState('')
  const [picking, setPicking] = useState(false)

  const [count, setCount] = useState('')
  const [transDate, setTransDate] = useState(today())
  const [transId, setTransId] = useState('')
  const [nominee, setNominee] = useState('')
  const [narration, setNarration] = useState('')

  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const [busy, setBusy] = useState(false)

  // The transaction number this transfer will take.
  useEffect(() => {
    api
      .get('/shares/new')
      .then((d) => setTransId(d.transId))
      .catch(() => {})
  }, [])
  const accRef = useRef(null)

  useEffect(() => {
    if (initialAccNo) lookupShare(initialAccNo)
    else accRef.current?.focus()
    // Only on arrival; the Go button decides afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAccNo])

  async function lookupShare(no) {
    const v = String(no || '').trim()
    if (!v) return
    try {
      const { share } = await api.get(`/shares/lookup/${encodeURIComponent(v)}`)
      setFrom(share)
      setAccNo(share.accNo)
      setError(share.status === 'C' ? 'That holding has already been transferred away in full.' : '')
    } catch (e) {
      setFrom(null)
      setError(e.message)
    }
  }

  async function lookupCustomer(custId) {
    const v = String(custId || '').trim()
    if (!v) return
    try {
      const { customer } = await api.get(`/customers/lookup/${encodeURIComponent(v)}`)
      const { accounts } = await api.get(`/customers/${customer.id}/accounts`)
      setToAccNo(accounts.find((a) => a.accType === 'Share' && a.status === 'Active')?.accNo || '')
      setToCustomer(customer)
      setToCustId(customer.custId)
      setError('')
    } catch (e) {
      setToCustomer(null)
      setError(e.message)
    }
  }

  // The run that will move, which is the tail of what the holder has.
  const moving = n(count)
  const distTo = from?.shareNoTo || 0
  const distFrom = moving > 0 ? distTo - moving + 1 : 0
  const amount = from ? r2(moving * from.shareValue) : 0

  async function save(e) {
    e.preventDefault()
    if (!from) return setError('Find the holding the shares are coming from.')
    if (!toCustomer) return setError('Enter the member the shares are going to.')
    if (moving <= 0) return setError('Enter how many shares are moving.')
    setBusy(true)
    setError('')
    try {
      const r = await api.post('/shares/transfers', {
        fromAccNo: from.accNo,
        toCustId: toCustomer.custId,
        noOfShares: moving,
        transDate,
        nominee,
        narration,
      })
      setDone(r)
    } catch (e2) {
      setError(e2.message)
    } finally {
      setBusy(false)
    }
  }

  function again() {
    setDone(null)
    setFrom(null)
    setAccNo('')
    setToCustomer(null)
    setToCustId('')
    setCount('')
    setNominee('')
    setNarration('')
    setTimeout(() => accRef.current?.focus(), 0)
  }

  if (done) {
    return (
      <div className="master">
        <div className="card">
          <header className="master-head">
            <div>
              <h2>Transfer {done.transfer.transId}</h2>
              <p className="muted">{fmtDate(done.transfer.transDate)}</p>
            </div>
          </header>
          <div className="master-body">
            <div className="notice success">
              {done.transfer.noOfShares} share{done.transfer.noOfShares === 1 ? '' : 's'} moved from{' '}
              {done.transfer.fromCustomerName} to {done.transfer.toCustomerName}.
            </div>
            <div className="frm">
              <Row label="Distinctive numbers">
                {done.transfer.distFrom} – {done.transfer.distTo}
              </Row>
              <Row label="Share amount">{fmtMoney(done.transfer.shareAmount)}</Row>
              <Row label="New holding">
                {done.to.accNo} · certificate {done.to.certificateNo}
              </Row>
              <Row label="Left with the transferor">
                {done.from.noOfShares} share{done.from.noOfShares === 1 ? '' : 's'}
                {done.from.status === 'C' ? ' — the holding is now closed' : ''}
              </Row>
            </div>
          </div>
          <div className="master-foot">
            <button className="btn ghost" onClick={() => navigate('share-view', { id: done.to.id })}>
              Open the new holding
            </button>
            <button className="btn primary" onClick={again}>
              Another transfer
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
            <h2>Share Transfer</h2>
            <p className="muted">{from ? `${from.accNo} · ${from.customerName}` : 'Move shares from one member to another'}</p>
          </div>
          <div className="master-head-right">
            <span className="master-date">{fmtDate(new Date())}</span>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <Sep>From</Sep>
          <div className="frm">
            <Row label="From Account" req>
              <div className="input-with-btn">
                <input
                  ref={accRef}
                  className="mono"
                  value={accNo}
                  onChange={(e) => setAccNo(e.target.value)}
                  onBlur={(e) => lookupShare(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      lookupShare(accNo)
                    }
                  }}
                  placeholder="201100123"
                />
                <button type="button" className="btn ghost" onClick={() => lookupShare(accNo)}>
                  View Details
                </button>
              </div>
            </Row>
            <Row label="Cust. Name">
              <input value={from ? `${from.custId} / ${from.customerName}` : ''} readOnly />
            </Row>

            <Row label="Scheme">
              <input value={from?.schemeName || from?.schemeCode || ''} readOnly />
            </Row>
            <Row label="No. of Shares / Value">
              <input value={from ? `${from.noOfShares} × ${fmtMoney(from.shareValue)}` : ''} readOnly />
            </Row>

            <Row label="Share Amount">
              <input value={from ? fmtMoney(from.shareAmount) : ''} readOnly />
            </Row>
            <Row label="Distinctive No.">
              <input className="mono" value={from ? `${from.shareNoFrom} – ${from.shareNoTo}` : ''} readOnly />
            </Row>
          </div>

          <Sep>To</Sep>
          <div className="frm">
            <Row label="To Account">
              <input
                className="mono"
                value={toCustomer ? toAccNo || 'A new holding will be opened' : ''}
                readOnly
                tabIndex={-1}
              />
            </Row>
            <Row label="Customer Id" req>
              <div className="input-with-btn">
                <input
                  className="mono"
                  value={toCustId}
                  onChange={(e) => setToCustId(e.target.value)}
                  onBlur={(e) => lookupCustomer(e.target.value)}
                  placeholder="10100131"
                />
                <button type="button" className="btn ghost" onClick={() => setPicking(true)}>
                  View Details
                </button>
              </div>
            </Row>
            <Row label="Customer Name">
              <input value={toCustomer?.name || ''} readOnly />
            </Row>

            <Row label="No. of Shares" req>
              <input
                className="w-sm"
                type="number"
                min="1"
                max={from?.noOfShares || undefined}
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </Row>
            <Row label="Share Amount">
              <input value={moving > 0 ? fmtMoney(amount) : ''} readOnly />
            </Row>

            <Row label="Share No From">
              <input className="mono" value={distFrom || ''} readOnly />
            </Row>
            <Row label="Share No To">
              <input className="mono" value={moving > 0 ? distTo : ''} readOnly />
            </Row>

            <Row label="Transaction Id">
              <input className="mono w-sm" value={transId} readOnly tabIndex={-1} />
            </Row>
            <Row label="Transaction Date">
              <input type="date" value={transDate} onChange={(e) => setTransDate(e.target.value)} />
            </Row>
            <Row label="Nominee">
              <input value={nominee} onChange={(e) => setNominee(e.target.value)} />
            </Row>

            <Row label="Narration" span={3}>
              <input value={narration} onChange={(e) => setNarration(e.target.value)} />
            </Row>
          </div>

          {from && moving > 0 && (
            <p className="muted" style={{ marginTop: 12 }}>
              {from.noOfShares - moving === 0
                ? `All ${from.noOfShares} shares move, so ${from.customerName}'s holding closes.`
                : `${from.noOfShares - moving} share${from.noOfShares - moving === 1 ? '' : 's'} stay with ${
                    from.customerName
                  }, numbered ${from.shareNoFrom} – ${distFrom - 1}.`}
            </p>
          )}
        </div>

        <div className="master-foot">
          <button type="button" className="btn ghost" onClick={() => navigate('share-list')} disabled={busy}>
            Close
          </button>
          <button className="btn primary" type="submit" disabled={busy || !from || from.status === 'C'}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {picking && (
        <CustomerPicker
          title="Transfer the shares to"
          onClose={() => setPicking(false)}
          onPick={(c) => {
            setToCustomer(c)
            setToCustId(c.custId)
            setPicking(false)
          }}
        />
      )}
    </form>
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
