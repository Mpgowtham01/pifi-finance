import { useEffect, useRef, useState } from 'react'
import { api } from '../../api.js'
import { ageFrom, dateInput, fmtDate, fmtMoney } from '../../lib/format.js'
import CustomerPicker from '../CustomerPicker.jsx'

// Fixed_Deposit_Master.aspx rebuilt: the same fields in the same order. What
// the deposit will be worth is worked out by the server as the terms are
// typed, so the screen never has to guess at the interest rule.

const MOP_LABELS = {
  S: 'S-Single', E: 'E-EorS', F: 'F-ForS', A: 'A-AorS', J: 'J-Joint', M: 'M-Minor',
}
const REPAYMENT_LABELS = { '1A': '1A-Monthly', '3A': '3A-Quarterly', M: 'M-On Maturity' }
const COMPOUNDING_LABELS = { N: 'N-No', M: 'Monthly', Q: 'Quarterly', H: 'Half-yearly', Y: 'Yearly' }
const PERIODS = [12, 24, 36, 48, 60]

const today = () => new Date().toISOString().slice(0, 10)
const n = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? 0 : Number(v))

export default function FdForm({ navigate, id }) {
  const editing = !!id
  const topRef = useRef(null)
  const [defs, setDefs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(null)

  const [accNo, setAccNo] = useState('')
  const [transId, setTransId] = useState('')
  const [customer, setCustomer] = useState(null)
  const [custIdInput, setCustIdInput] = useState('')
  const [joints, setJoints] = useState(['', '', ''])
  const [jointNames, setJointNames] = useState(['', '', ''])
  const [quote, setQuote] = useState(null)

  const [form, setForm] = useState({
    schemeCode: '', mop: 'S', openDate: today(), effectDate: today(), transDate: today(),
    periodMonths: '12', depositAmount: '', interestRate: '',
    compounding: 'N', interestRepayment: 'M', intPaymentMode: 'Cash', intPayoutMode: 'D2D',
    glCode: '', oldAccNo: '', referredBy: '',
    minorName: '', minorDob: '',
    nomineeName: '', nomineeRelation: '', nomineeAge: '', nomineeDob: '',
    isSeniorCitizen: false, isSuperSenior: false, isStaff: false,
    deductTds: false, withoutTransaction: false,
    narration: '',
  })

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const d = await api.get('/deposits/new')
        if (dead) return
        setDefs(d)
        if (!editing) {
          setAccNo(d.accNo)
          setTransId(d.transId)
          setForm((f) => ({
            ...f,
            schemeCode: f.schemeCode || d.schemes[0]?.code || '',
            glCode: f.glCode || d.glAccounts[0]?.code || '',
          }))
        } else {
          const { deposit } = await api.get(`/deposits/${id}`)
          if (dead) return
          setAccNo(deposit.accNo)
          setTransId(deposit.transId)
          setCustomer({ custId: deposit.custId, name: deposit.customerName })
          setCustIdInput(deposit.custId)
          setJoints([deposit.jointCustIds?.[0] || '', deposit.jointCustIds?.[1] || '', deposit.jointCustIds?.[2] || ''])
          setJointNames([deposit.jointNames?.[0] || '', deposit.jointNames?.[1] || '', deposit.jointNames?.[2] || ''])
          setForm({
            schemeCode: deposit.schemeCode, mop: deposit.mop,
            openDate: dateInput(deposit.openDate), effectDate: dateInput(deposit.effectDate),
            transDate: dateInput(deposit.transDate),
            periodMonths: String(deposit.periodMonths), depositAmount: String(deposit.depositAmount),
            interestRate: String(deposit.interestRate),
            compounding: deposit.compounding, interestRepayment: deposit.interestRepayment,
            intPaymentMode: deposit.intPaymentMode, intPayoutMode: deposit.intPayoutMode,
            glCode: deposit.glCode, oldAccNo: deposit.oldAccNo, referredBy: deposit.referredBy,
            minorName: deposit.minor?.name || '', minorDob: dateInput(deposit.minor?.dob),
            nomineeName: deposit.nominee?.name || '', nomineeRelation: deposit.nominee?.relation || '',
            nomineeAge: deposit.nominee?.age != null ? String(deposit.nominee.age) : '',
            nomineeDob: dateInput(deposit.nominee?.dob),
            isSeniorCitizen: deposit.isSeniorCitizen, isSuperSenior: deposit.isSuperSenior,
            isStaff: deposit.isStaff, deductTds: deposit.deductTds,
            withoutTransaction: deposit.withoutTransaction,
            narration: deposit.narration || '',
          })
        }
      } catch (e) {
        if (!dead) setError(e.message)
      } finally {
        if (!dead) setLoading(false)
      }
    })()
    return () => {
      dead = true
    }
  }, [id, editing])

  // What it will be worth, worked out by the same code that will store it.
  useEffect(() => {
    if (n(form.depositAmount) <= 0 || n(form.periodMonths) <= 0) {
      setQuote(null)
      return
    }
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({
          amount: String(n(form.depositAmount)),
          rate: String(n(form.interestRate)),
          months: String(n(form.periodMonths)),
          compounding: form.compounding,
          repayment: form.interestRepayment,
          openDate: form.effectDate || form.openDate,
        })
        setQuote(await api.get(`/deposits/quote?${qs}`))
      } catch {
        /* the figures just will not show until the terms make sense */
      }
    }, 250)
    return () => clearTimeout(t)
  }, [
    form.depositAmount, form.interestRate, form.periodMonths,
    form.compounding, form.interestRepayment, form.effectDate, form.openDate,
  ])

  // Picking a scheme brings its rate for this period along with it.
  function setScheme(e) {
    const schemeCode = e.target.value
    setForm((f) => ({ ...f, schemeCode, interestRate: rateFor(schemeCode, f.periodMonths) || f.interestRate }))
  }
  function setPeriod(e) {
    const periodMonths = e.target.value
    setForm((f) => ({ ...f, periodMonths, interestRate: rateFor(f.schemeCode, periodMonths) || f.interestRate }))
  }
  function rateFor(schemeCode, months) {
    const slabs = defs?.ratesByScheme?.[schemeCode]
    if (!slabs?.length) return ''
    // The bands are written as text ("12 Months", "0-90 Days"), so a band
    // whose numbers bracket the term is the one that applies.
    const want = n(months)
    const hit = slabs.find((s) => {
      const nums = String(s.period).match(/\d+/g)?.map(Number) || []
      if (!nums.length) return false
      if (nums.length === 1) return nums[0] === want
      return want >= nums[0] && want <= nums[1]
    })
    return String((hit || slabs[0]).rate ?? '')
  }

  async function lookupCustomer(custId) {
    const v = String(custId || '').trim()
    if (!v) return
    try {
      const { customer: c } = await api.get(`/customers/lookup/${encodeURIComponent(v)}`)
      setCustomer(c)
      setCustIdInput(c.custId)
      setError('')
    } catch (e) {
      setCustomer(null)
      setError(e.message)
    }
  }

  async function lookupJoint(i, custId) {
    const v = String(custId || '').trim()
    if (!v) {
      setJointNames((xs) => xs.map((x, k) => (k === i ? '' : x)))
      return
    }
    try {
      const { customer: c } = await api.get(`/customers/lookup/${encodeURIComponent(v)}`)
      setJoints((xs) => xs.map((x, k) => (k === i ? c.custId : x)))
      setJointNames((xs) => xs.map((x, k) => (k === i ? c.name : x)))
      setError('')
    } catch (e) {
      setJointNames((xs) => xs.map((x, k) => (k === i ? '' : x)))
      setError(e.message)
    }
  }

  function setNomineeDob(e) {
    const nomineeDob = e.target.value
    setForm((f) => ({ ...f, nomineeDob, nomineeAge: ageFrom(nomineeDob) || f.nomineeAge }))
  }

  async function save(e) {
    e.preventDefault()
    if (!customer) {
      setError('Enter a valid customer id first.')
      topRef.current?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    if (n(form.depositAmount) <= 0) {
      setError('Enter the deposit amount.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const body = {
        ...form,
        custId: customer.custId,
        jointCustIds: joints.map((x) => x.trim()).filter(Boolean),
        depositAmount: n(form.depositAmount),
        periodMonths: n(form.periodMonths),
        interestRate: n(form.interestRate),
        minor: { name: form.minorName, dob: form.minorDob },
        nominee: {
          name: form.nomineeName,
          relation: form.nomineeRelation,
          age: form.nomineeAge,
          dob: form.nomineeDob,
        },
      }
      const res = editing ? await api.put(`/deposits/${id}`, body) : await api.post('/deposits', body)
      navigate('fd-view', { id: res.deposit.id })
    } catch (e2) {
      setError(e2.message)
      topRef.current?.scrollIntoView({ behavior: 'smooth' })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="muted">Loading…</div>

  const paysOut = form.interestRepayment !== 'M'

  return (
    <form className="master" onSubmit={save} ref={topRef}>
      <div className="card">
        <header className="master-head">
          <div>
            <h2>Fixed Deposit Master</h2>
            <p className="muted">
              {editing ? `${accNo} · ${customer?.name || ''}` : 'New deposit — the number is issued on save'}
            </p>
          </div>
          <div className="master-head-right">
            <span className="master-date">{fmtDate(new Date())}</span>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <div className="frm">
            <Row label="Account No">
              <input className="mono" value={accNo || 'Auto'} readOnly tabIndex={-1} />
            </Row>
            <Row label="Old Account No">
              <input value={form.oldAccNo} onChange={set('oldAccNo')} />
            </Row>

            <Row label="Customer Id" req>
              <div className="input-with-btn">
                <input
                  className="mono"
                  value={custIdInput}
                  onChange={(e) => setCustIdInput(e.target.value)}
                  onBlur={(e) => lookupCustomer(e.target.value)}
                  placeholder="10100130"
                  disabled={editing}
                />
                <button type="button" className="btn ghost" onClick={() => setPicking(0)} disabled={editing}>
                  View Details
                </button>
              </div>
            </Row>
            <Row label="Customer">
              <input value={customer ? `${customer.name}${customer.city ? ` · ${customer.city}` : ''}` : ''} readOnly />
            </Row>

            <Row label="Scheme" req>
              <select value={form.schemeCode} onChange={setScheme} required>
                <option value="">Select</option>
                {defs?.schemes.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Mode of Operation">
              <select value={form.mop} onChange={set('mop')}>
                {(defs?.mops || Object.keys(MOP_LABELS)).map((m) => (
                  <option key={m} value={m}>
                    {MOP_LABELS[m] || m}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Open Date" req>
              <input type="date" value={form.openDate} onChange={set('openDate')} required />
            </Row>
            <Row label="Effect Date">
              <input type="date" value={form.effectDate} onChange={set('effectDate')} />
            </Row>
          </div>

          <Sep>Deposit</Sep>

          <div className="frm">
            <Row label="Deposit Amount" req>
              <input type="number" step="0.01" value={form.depositAmount} onChange={set('depositAmount')} required />
            </Row>
            <Row label="Period" req>
              <select value={form.periodMonths} onChange={setPeriod} required>
                {PERIODS.map((m) => (
                  <option key={m} value={m}>
                    {m} Months
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Interest Rate %" req>
              <input className="w-sm" type="number" step="0.01" value={form.interestRate} onChange={set('interestRate')} required />
            </Row>
            <Row label="Int. payment freq">
              <select value={form.interestRepayment} onChange={set('interestRepayment')}>
                {(defs?.repayments || Object.keys(REPAYMENT_LABELS)).map((r) => (
                  <option key={r} value={r}>
                    {REPAYMENT_LABELS[r] || r}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Compounding">
              <select value={form.compounding} onChange={set('compounding')} disabled={paysOut}>
                {(defs?.compoundings || Object.keys(COMPOUNDING_LABELS)).map((c) => (
                  <option key={c} value={c}>
                    {COMPOUNDING_LABELS[c] || c}
                  </option>
                ))}
              </select>
              {paysOut && <small className="muted">Interest taken out cannot compound.</small>}
            </Row>
            <Row label="Interest Payment">
              <select value={form.intPayoutMode} onChange={set('intPayoutMode')}>
                <option value="ME">1st day of Month</option>
                <option value="D2D">Date to Date</option>
              </select>
            </Row>

            <Row label="Int. Payment Mode">
              <select value={form.intPaymentMode} onChange={set('intPaymentMode')}>
                <option>Cash</option>
                <option>Standing Instruction</option>
                <option>Transfer</option>
              </select>
            </Row>
            <Row label="Mode of Receipt">
              <select value={form.glCode} onChange={set('glCode')}>
                {defs?.glAccounts.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Row>
          </div>

          {quote && (
            <div className="stat-grid" style={{ marginTop: 18 }}>
              <Stat label="Maturity date" value={fmtDate(quote.maturityDate)} />
              <Stat label="Projected interest" value={fmtMoney(quote.projectedInterest)} />
              <Stat label="Maturity amount" value={fmtMoney(quote.maturityAmount)} />
              {paysOut && (
                <Stat
                  label={form.interestRepayment === '1A' ? 'Each month' : 'Each quarter'}
                  value={fmtMoney(quote.perPayout)}
                />
              )}
            </div>
          )}

          <Sep>Joint holders</Sep>
          <div className="frm">
            {[0, 1, 2].map((i) => (
              <Row key={i} label={`Customer Id ${i + 2}`}>
                <div className="input-with-btn">
                  <input
                    className="mono"
                    value={joints[i]}
                    onChange={(e) => setJoints((xs) => xs.map((x, k) => (k === i ? e.target.value : x)))}
                    onBlur={(e) => lookupJoint(i, e.target.value)}
                    placeholder={jointNames[i] || 'Optional'}
                  />
                  <button type="button" className="btn ghost" onClick={() => setPicking(i + 1)}>
                    Search
                  </button>
                </div>
                {jointNames[i] && <small className="muted">{jointNames[i]}</small>}
              </Row>
            ))}
          </div>

          <Sep>Minor, nominee and flags</Sep>
          <div className="frm">
            <Row label="Minor Name">
              <input value={form.minorName} onChange={set('minorName')} />
            </Row>
            <Row label="Minor DOB">
              <input type="date" value={form.minorDob} onChange={set('minorDob')} />
            </Row>

            <Row label="Nominee Name">
              <input value={form.nomineeName} onChange={set('nomineeName')} />
            </Row>
            <Row label="Relationship">
              <input value={form.nomineeRelation} onChange={set('nomineeRelation')} />
            </Row>

            <Row label="DOB, if minor">
              <input type="date" value={form.nomineeDob} onChange={setNomineeDob} />
            </Row>
            <Row label="Nominee Age">
              <input className="w-sm" type="number" value={form.nomineeAge} onChange={set('nomineeAge')} />
            </Row>

            <Row label="Referred By">
              <input value={form.referredBy} onChange={set('referredBy')} />
            </Row>
            <Row label="Flags">
              <div className="check-row wrap">
                <label className="inline-check">
                  <input type="checkbox" checked={form.isSeniorCitizen} onChange={set('isSeniorCitizen')} />
                  Sr. Citizen
                </label>
                <label className="inline-check">
                  <input type="checkbox" checked={form.isSuperSenior} onChange={set('isSuperSenior')} />
                  Super Sr.
                </label>
                <label className="inline-check">
                  <input type="checkbox" checked={form.isStaff} onChange={set('isStaff')} />
                  Staff
                </label>
                <label className="inline-check">
                  <input type="checkbox" checked={form.deductTds} onChange={set('deductTds')} />
                  TDS
                </label>
                <label className="inline-check">
                  <input type="checkbox" checked={form.withoutTransaction} onChange={set('withoutTransaction')} />
                  Without transaction
                </label>
              </div>
            </Row>

            <Row label="Trans. Id">
              <input className="mono w-sm" value={transId} readOnly tabIndex={-1} />
            </Row>
            <Row label="Trans. Date">
              <input type="date" value={form.transDate} onChange={set('transDate')} />
            </Row>

            <Row label="Narration" span={3}>
              <textarea rows={2} value={form.narration} onChange={set('narration')} />
            </Row>
          </div>
        </div>

        <div className="master-foot">
          <span className="req-hint muted">* required</span>
          <button type="button" className="btn ghost" onClick={() => navigate('fd-list')} disabled={busy}>
            Close
          </button>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {picking !== null && (
        <CustomerPicker
          title={picking === 0 ? 'Find the depositor' : `Find joint holder ${picking + 1}`}
          onClose={() => setPicking(null)}
          onPick={(c) => {
            if (picking === 0) {
              setCustomer(c)
              setCustIdInput(c.custId)
            } else {
              const i = picking - 1
              setJoints((xs) => xs.map((x, k) => (k === i ? c.custId : x)))
              setJointNames((xs) => xs.map((x, k) => (k === i ? c.name : x)))
            }
            setPicking(null)
          }}
        />
      )}
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
