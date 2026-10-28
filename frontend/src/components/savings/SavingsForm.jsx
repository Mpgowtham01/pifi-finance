import { useEffect, useRef, useState } from 'react'
import { api } from '../../api.js'
import { ageFrom, dateInput, fmtDate } from '../../lib/format.js'
import CustomerPicker from '../CustomerPicker.jsx'

// Savings_Master.aspx rebuilt: the same fields in the same order — the first
// holder and up to three more, the scheme, the mode of operation, the minor's
// details and the nominee.

const MOP_LABELS = {
  S: 'S-Single',
  E: 'E-EorS',
  F: 'F-ForS',
  A: 'A-AorS',
  J: 'Joint',
  M: 'M-Minor',
}
const today = () => new Date().toISOString().slice(0, 10)
const n = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? 0 : Number(v))

export default function SavingsForm({ navigate, id }) {
  const editing = !!id
  const topRef = useRef(null)
  const [defs, setDefs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(null) // which holder slot is being picked

  const [accNo, setAccNo] = useState('')
  const [customer, setCustomer] = useState(null)
  const [custIdInput, setCustIdInput] = useState('')
  // The three further holders the old form allowed, as typed.
  const [joints, setJoints] = useState(['', '', ''])
  const [status, setStatus] = useState('A')
  const [jointNames, setJointNames] = useState(['', '', ''])

  const [form, setForm] = useState({
    schemeCode: '', openDate: today(), mop: 'S', interestRate: '',
    minorName: '', minorDob: '',
    nomineeName: '', nomineeRelation: '', nomineeAge: '', nomineeDob: '',
    narration: '',
  })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const d = await api.get('/savings/new')
        if (dead) return
        setDefs(d)
        if (!editing) {
          setAccNo(d.accNo)
          const first = d.schemes[0]?.code || ''
          setForm((f) => ({
            ...f,
            schemeCode: f.schemeCode || first,
            interestRate: f.interestRate || String(d.rateByScheme?.[first] ?? ''),
          }))
        } else {
          const { account } = await api.get(`/savings/${id}`)
          if (dead) return
          setAccNo(account.accNo)
          setStatus(account.status || 'A')
          setCustomer({ custId: account.custId, name: account.customerName })
          setCustIdInput(account.custId)
          setJoints([account.jointCustIds?.[0] || '', account.jointCustIds?.[1] || '', account.jointCustIds?.[2] || ''])
          setJointNames([account.jointNames?.[0] || '', account.jointNames?.[1] || '', account.jointNames?.[2] || ''])
          setForm({
            schemeCode: account.schemeCode,
            openDate: dateInput(account.openDate),
            mop: account.mop,
            interestRate: String(account.interestRate),
            minorName: account.minor?.name || '',
            minorDob: dateInput(account.minor?.dob),
            nomineeName: account.nominee?.name || '',
            nomineeRelation: account.nominee?.relation || '',
            nomineeAge: account.nominee?.age != null ? String(account.nominee.age) : '',
            nomineeDob: dateInput(account.nominee?.dob),
            narration: account.narration || '',
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

  // Picking a scheme brings its current rate with it.
  function setScheme(e) {
    const schemeCode = e.target.value
    setForm((f) => ({
      ...f,
      schemeCode,
      interestRate: defs?.rateByScheme?.[schemeCode] != null ? String(defs.rateByScheme[schemeCode]) : f.interestRate,
    }))
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
    setBusy(true)
    setError('')
    try {
      const body = {
        custId: customer.custId,
        jointCustIds: joints.map((x) => x.trim()).filter(Boolean),
        schemeCode: form.schemeCode,
        openDate: form.openDate,
        mop: form.mop,
        interestRate: n(form.interestRate),
        minor: { name: form.minorName, dob: form.minorDob },
        nominee: {
          name: form.nomineeName,
          relation: form.nomineeRelation,
          age: form.nomineeAge,
          dob: form.nomineeDob,
        },
        narration: form.narration,
      }
      const res = editing ? await api.put(`/savings/${id}`, body) : await api.post('/savings', body)
      navigate('sb-view', { id: res.account.id })
    } catch (e2) {
      setError(e2.message)
      topRef.current?.scrollIntoView({ behavior: 'smooth' })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="muted">Loading…</div>

  return (
    <form className="master" onSubmit={save} ref={topRef}>
      <div className="card">
        <header className="master-head">
          <div>
            <h2>Savings A/c Master</h2>
            <p className="muted">
              {editing ? `${accNo} · ${customer?.name || ''}` : 'New account — the number is issued on save'}
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
            <Row label="A/c Open Date" req>
              <input type="date" value={form.openDate} onChange={set('openDate')} required />
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

            <Row label="Account Status">
              <input value={status === 'C' ? 'C-Closed' : 'A-Active'} readOnly tabIndex={-1} />
            </Row>
            <Row label="Interest Rate %">
              <input className="w-sm" type="number" step="0.01" value={form.interestRate} onChange={set('interestRate')} />
            </Row>
            <Row label=" ">
              <span className="muted" style={{ fontSize: 13 }}>
                Interest is worked out on the balance standing each day.
              </span>
            </Row>
          </div>

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

          <Sep>Minor and nominee</Sep>
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

            <Row label="Nominee DOB">
              <input type="date" value={form.nomineeDob} onChange={setNomineeDob} />
            </Row>
            <Row label="Nominee Age">
              <input className="w-sm" type="number" value={form.nomineeAge} onChange={set('nomineeAge')} />
            </Row>

            <Row label="Narration" span={3}>
              <textarea rows={2} value={form.narration} onChange={set('narration')} />
            </Row>
          </div>
        </div>

        <div className="master-foot">
          <span className="req-hint muted">* required</span>
          <button type="button" className="btn ghost" onClick={() => navigate('sb-list')} disabled={busy}>
            Close
          </button>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {picking !== null && (
        <CustomerPicker
          title={picking === 0 ? 'Find the account holder' : `Find joint holder ${picking + 1}`}
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
