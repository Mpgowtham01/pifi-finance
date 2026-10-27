import { useEffect, useRef, useState } from 'react'
import { api } from '../../api.js'
import { ageFrom, dateInput, fmtDate, fmtMoney } from '../../lib/format.js'
import CustomerPicker from '../CustomerPicker.jsx'

// Share_Master.aspx rebuilt: the same fields in the same order. The run of
// distinctive numbers is taken off the end of the branch's sequence when the
// allotment is saved, so two members can never be given the same share
// numbers — the screen only shows where the run will start.

const n = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? 0 : Number(v))
const r2 = (v) => Math.round(n(v) * 100) / 100
const today = () => new Date().toISOString().slice(0, 10)

export default function ShareForm({ navigate, id }) {
  const editing = !!id
  const topRef = useRef(null)
  const [defs, setDefs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)

  const [accNo, setAccNo] = useState('')
  const [transId, setTransId] = useState('')
  const [shareNoFrom, setShareNoFrom] = useState(0)
  const [customer, setCustomer] = useState(null)
  const [custIdInput, setCustIdInput] = useState('')

  const [form, setForm] = useState({
    schemeCode: '', date: today(), noOfShares: '', shareValue: '',
    certificateNo: '', transferee: '', duplicateNo: '',
    nomineeName: '', nomineeRelation: '', nomineeAge: '', nomineeDob: '',
    transDate: today(), glCode: '', entranceFees: '',
    branchShare: false, narration: '',
  })

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const d = await api.get('/shares/new')
        if (dead) return
        setDefs(d)
        if (!editing) {
          setAccNo(d.accNo)
          setTransId(d.transId)
          setShareNoFrom(d.shareNoFrom)
          setForm((f) => ({
            ...f,
            schemeCode: f.schemeCode || d.schemes[0]?.code || '',
            glCode: f.glCode || d.glAccounts[0]?.code || '',
            certificateNo: d.certificateNo,
          }))
        } else {
          const { share } = await api.get(`/shares/${id}`)
          if (dead) return
          setAccNo(share.accNo)
          setTransId(share.transId)
          setShareNoFrom(share.shareNoFrom)
          setCustomer({ custId: share.custId, name: share.customerName })
          setCustIdInput(share.custId)
          setForm({
            schemeCode: share.schemeCode,
            date: dateInput(share.date),
            noOfShares: String(share.noOfShares),
            shareValue: String(share.shareValue),
            certificateNo: share.certificateNo,
            transferee: share.transferee,
            duplicateNo: share.duplicateNo,
            nomineeName: share.nominee?.name || '',
            nomineeRelation: share.nominee?.relation || '',
            nomineeAge: share.nominee?.age != null ? String(share.nominee.age) : '',
            nomineeDob: dateInput(share.nominee?.dob),
            transDate: dateInput(share.transDate),
            glCode: share.glCode,
            entranceFees: String(share.entranceFees),
            branchShare: share.branchShare,
            narration: share.narration,
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

  const count = n(form.noOfShares)
  const shareAmount = r2(count * n(form.shareValue))
  const shareNoTo = count > 0 ? shareNoFrom + count - 1 : shareNoFrom

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

  // The nominee's age follows the date of birth, as it did on the old form.
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
    if (count <= 0) {
      setError('Enter how many shares are being issued.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const body = {
        ...form,
        custId: customer.custId,
        noOfShares: count,
        shareValue: n(form.shareValue),
        shareAmount,
        entranceFees: n(form.entranceFees),
        nominee: {
          name: form.nomineeName,
          relation: form.nomineeRelation,
          age: form.nomineeAge,
          dob: form.nomineeDob,
        },
      }
      const res = editing ? await api.put(`/shares/${id}`, body) : await api.post('/shares', body)
      navigate('share-view', { id: res.share.id })
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
            <h2>Share Master</h2>
            <p className="muted">
              {editing
                ? `${accNo} · ${customer?.name || ''}`
                : 'New allotment — the account and certificate numbers are issued on save'}
            </p>
          </div>
          <div className="master-head-right">
            <span className="master-date">{fmtDate(new Date())}</span>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}

          <div className="frm">
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
                <button type="button" className="btn ghost" onClick={() => setPicking(true)} disabled={editing}>
                  View Details
                </button>
              </div>
            </Row>
            <Row label="Customer">
              <input value={customer ? `${customer.name}${customer.city ? ` · ${customer.city}` : ''}` : ''} readOnly />
            </Row>

            <Row label="Share Type" req>
              <select value={form.schemeCode} onChange={set('schemeCode')} required>
                <option value="">Select</option>
                {defs?.schemes.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Account Number">
              <input className="mono" value={accNo || 'Auto'} readOnly tabIndex={-1} />
            </Row>

            <Row label="Date" req>
              <input type="date" value={form.date} onChange={set('date')} required />
            </Row>
            <Row label="No of Shares" req>
              <input
                className="w-sm"
                type="number"
                min="1"
                value={form.noOfShares}
                onChange={set('noOfShares')}
                required
              />
            </Row>

            <Row label="Share Value" req>
              <input type="number" step="0.01" value={form.shareValue} onChange={set('shareValue')} required />
            </Row>
            <Row label="Share Amount">
              <input value={fmtMoney(shareAmount)} readOnly />
            </Row>

            <Row label="Share No From">
              <input className="mono" value={shareNoFrom || ''} readOnly />
            </Row>
            <Row label="Share No To">
              <input className="mono" value={shareNoTo || ''} readOnly />
            </Row>

            <Row label="Certificate No">
              <input className="mono" value={form.certificateNo} onChange={set('certificateNo')} />
            </Row>
            <Row label="Transferee">
              <input value={form.transferee} onChange={set('transferee')} placeholder="If it came from another member" />
            </Row>
          </div>

          <Sep>Nominee</Sep>

          <div className="frm">
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
          </div>

          <Sep>Receipt</Sep>

          <div className="frm">
            <Row label="Transaction Id">
              <input className="mono w-sm" value={transId} readOnly tabIndex={-1} />
            </Row>
            <Row label="Transaction Date">
              <input type="date" value={form.transDate} onChange={set('transDate')} />
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
            <Row label="Entrance Fees">
              <input type="number" step="0.01" value={form.entranceFees} onChange={set('entranceFees')} />
            </Row>

            <Row label="Duplicate No.">
              <input value={form.duplicateNo} onChange={set('duplicateNo')} />
            </Row>
            <Row label="Branch share">
              <label className="inline-check">
                <input type="checkbox" checked={form.branchShare} onChange={set('branchShare')} />
                Held by the branch itself
              </label>
            </Row>

            <Row label="Narration" span={3}>
              <textarea rows={2} value={form.narration} onChange={set('narration')} />
            </Row>
          </div>
        </div>

        <div className="master-foot">
          <span className="req-hint muted">* required</span>
          <button type="button" className="btn ghost" onClick={() => navigate('share-list')} disabled={busy}>
            Close
          </button>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {picking && (
        <CustomerPicker
          title="Find the member"
          onClose={() => setPicking(false)}
          onPick={(c) => {
            setCustomer(c)
            setCustIdInput(c.custId)
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
