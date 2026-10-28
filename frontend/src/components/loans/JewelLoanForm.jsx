import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api.js'
import ImageBox, { shrink } from '../ImageBox.jsx'
import { dateInput, fmtDate, fmtMoney } from '../../lib/format.js'
import CustomerPicker from '../CustomerPicker.jsx'

// JL_Master.aspx rebuilt: the same fields in the same order, and the same
// flow — type a customer id, add the jewels one at a time into the grid, and
// the valuation and the net disbursal fill themselves in as you go.

const n = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? 0 : Number(v))
const r2 = (v) => Math.round(n(v) * 100) / 100

const BLANK_JEWEL = {
  jewelId: '', description: '', items: '1', grossWeight: '', deduction: '',
  touch: '22ct', ratePerGram: '',
}

// Purity is quoted against 22 carat, which is what the per-gram rate is set on.
const touchFactor = (t) => (Number(String(t).replace(/[^0-9.]/g, '')) || 22) / 22

// The last day of a short month, so a loan opened on the 31st falls due on the 30th.
function addMonths(iso, months) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const last = new Date(Date.UTC(y, m - 1 + Number(months || 0) + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m - 1 + Number(months || 0), Math.min(d, last))).toISOString().slice(0, 10)
}

const today = () => new Date().toISOString().slice(0, 10)

export default function JewelLoanForm({ navigate, id }) {
  const editing = !!id
  const topRef = useRef(null)
  const [defs, setDefs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [picking, setPicking] = useState(false)

  const [accNo, setAccNo] = useState('')
  const [status, setStatus] = useState('A')
  const [photo, setPhoto] = useState({ src: '', dirty: false })
  const [transId, setTransId] = useState('')
  const [customer, setCustomer] = useState(null) // { custId, name, ... }
  const [custIdInput, setCustIdInput] = useState('')
  const [jewels, setJewels] = useState([])
  const [draft, setDraft] = useState(BLANK_JEWEL)

  const [form, setForm] = useState({
    schemeCode: '', glCode: '', loanType: 'NE', purpose: 'Walk-in', oldAccNo: '',
    openDate: today(), transDate: today(), periodMonths: '6', dueDate: '',
    marketRate: '', ratePerGram: '',
    loanAmount: '', interestRate: '', penalRate: '', insurancePerMonth: '',
    appraiserFee: '', serviceTax: '', formsFee: '', otherDeductions: '',
    lockerAccNo: '', referredById: '', referredByName: '',
    nomineeName: '', nomineeRelation: '', nomineeAge: '',
    isStaff: false, narration: '',
  })

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  /* ------------------------------------------------------------ load */

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const d = await api.get('/loans/jewel/new')
        if (dead) return
        setDefs(d)
        if (!editing) {
          setAccNo(d.accNo)
          setTransId(d.transId)
          setForm((f) => ({
            ...f,
            schemeCode: f.schemeCode || d.schemes[0]?.code || '',
            glCode: f.glCode || d.glAccounts[0]?.code || '',
            marketRate: d.goldRate?.marketRate ? String(d.goldRate.marketRate) : '',
            ratePerGram: d.ratePerGram ? String(d.ratePerGram) : '',
            dueDate: addMonths(today(), 6),
          }))
        }
        if (editing) {
          const { loan } = await api.get(`/loans/jewel/${id}`)
          if (dead) return
          setAccNo(loan.accNo)
          setTransId(loan.transId)
          setStatus(loan.status || 'A')
          if (loan.hasPhoto) setPhoto({ src: `/api/loans/jewel/${id}/photo`, dirty: false })
          setCustomer({ custId: loan.custId, name: loan.customerName })
          setCustIdInput(loan.custId)
          setJewels(
            loan.jewels.map((j) => ({
              ...j,
              items: String(j.items), grossWeight: String(j.grossWeight),
              deduction: String(j.deduction), ratePerGram: String(j.ratePerGram),
            }))
          )
          setForm({
            schemeCode: loan.schemeCode, glCode: loan.glCode, loanType: loan.loanType,
            purpose: loan.purpose, oldAccNo: loan.oldAccNo,
            openDate: dateInput(loan.openDate), transDate: dateInput(loan.transDate),
            periodMonths: String(loan.periodMonths), dueDate: dateInput(loan.dueDate),
            marketRate: String(loan.marketRate), ratePerGram: String(loan.ratePerGram),
            loanAmount: String(loan.loanAmount), interestRate: String(loan.interestRate),
            penalRate: String(loan.penalRate), insurancePerMonth: String(loan.insurancePerMonth),
            appraiserFee: String(loan.appraiserFee), serviceTax: String(loan.serviceTax),
            formsFee: String(loan.formsFee), otherDeductions: '',
            lockerAccNo: loan.lockerAccNo, referredById: loan.referredById,
            referredByName: loan.referredByName,
            nomineeName: loan.nominee?.name || '', nomineeRelation: loan.nominee?.relation || '',
            nomineeAge: loan.nominee?.age != null ? String(loan.nominee.age) : '',
            isStaff: loan.isStaff, narration: loan.narration,
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

  /* ------------------------------------------------------- derived sums */

  const totals = useMemo(() => {
    const rows = jewels.map((j) => {
      const net = r2(n(j.grossWeight) - n(j.deduction))
      return { ...j, net, value: r2(net * n(j.ratePerGram)) }
    })
    return {
      rows,
      items: rows.reduce((t, j) => t + n(j.items), 0),
      gross: r2(rows.reduce((t, j) => t + n(j.grossWeight), 0)),
      net: r2(rows.reduce((t, j) => t + j.net, 0)),
      value: r2(rows.reduce((t, j) => t + j.value, 0)),
    }
  }, [jewels])

  const deductions = r2(
    n(form.appraiserFee) + n(form.serviceTax) + n(form.formsFee) + n(form.insurancePerMonth) + n(form.otherDeductions)
  )
  const disbAmt = r2(n(form.loanAmount) - deductions)

  // The jewel being typed, priced the way it will be stored.
  const draftNet = r2(n(draft.grossWeight) - n(draft.deduction))
  const draftRate = draft.ratePerGram !== '' ? n(draft.ratePerGram) : r2(n(form.ratePerGram) * touchFactor(draft.touch))
  const draftValue = r2(draftNet * draftRate)

  /* ------------------------------------------------------------ actions */

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

  function addJewel() {
    if (!draft.description.trim()) {
      setError('Pick what the jewel is before adding it.')
      return
    }
    if (draftNet <= 0) {
      setError('Enter the weight of the jewel.')
      return
    }
    setError('')
    setJewels((rows) => [...rows, { ...draft, ratePerGram: String(draftRate) }])
    setDraft({ ...BLANK_JEWEL, touch: draft.touch })
  }

  function setPeriod(e) {
    const months = e.target.value
    setForm((f) => ({ ...f, periodMonths: months, dueDate: addMonths(f.openDate, months) }))
  }

  function setOpenDate(e) {
    const openDate = e.target.value
    setForm((f) => ({ ...f, openDate, dueDate: addMonths(openDate, f.periodMonths) }))
  }

  function setMarketRate(e) {
    const marketRate = e.target.value
    // Gold is quoted per sovereign of eight grams and lent against per gram.
    setForm((f) => ({ ...f, marketRate, ratePerGram: String(r2(n(marketRate) / 8)) }))
  }

  async function save(e) {
    e.preventDefault()
    if (!customer) {
      setError('Enter a valid customer id first.')
      topRef.current?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    if (jewels.length === 0) {
      setError('Add at least one jewel to the pledge.')
      return
    }
    if (n(form.loanAmount) <= 0) {
      setError('Enter the loan amount.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const body = {
        ...form,
        custId: customer.custId,
        jewels: totals.rows.map((j) => ({
          jewelId: j.jewelId, description: j.description, items: n(j.items),
          grossWeight: n(j.grossWeight), deduction: n(j.deduction), netWeight: j.net,
          touch: j.touch, ratePerGram: n(j.ratePerGram), value: j.value,
        })),
        deductions,
        disbAmt,
        loanPayable: n(form.loanAmount),
        nominee: { name: form.nomineeName, relation: form.nomineeRelation, age: form.nomineeAge },
      }
      if (photo.dirty) body.photo = photo.src || ''
      const res = editing ? await api.put(`/loans/jewel/${id}`, body) : await api.post('/loans/jewel', body)
      setOk(`Loan ${res.loan.accNo} saved.`)
      navigate('jl-view', { id: res.loan.id })
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
            <h2>Jewel Loan Master</h2>
            <p className="muted">
              {editing ? `${accNo} · ${customer?.name || ''}` : 'New pledge — the account number is issued on save'}
            </p>
          </div>
          <div className="master-head-right">
            <span className="master-date">{fmtDate(new Date())}</span>
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}
          {ok && <div className="notice success">{ok}</div>}

          <div className="frm">
            <Row label="Account No">
              <input className="mono" value={accNo || 'Auto'} readOnly tabIndex={-1} />
            </Row>
            <Row label="Trans. Id">
              <input className="mono w-sm" value={transId} readOnly tabIndex={-1} />
            </Row>

            <Row label="Account Status">
              <input value={status === 'C' ? 'C-Closed' : 'A-Active'} readOnly tabIndex={-1} />
            </Row>
            <Row label=" ">
              <span className="muted">A loan closes when it is paid off, not from this screen.</span>
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
                <button type="button" className="btn ghost" onClick={() => setPicking(true)} disabled={editing}>
                  View Details
                </button>
              </div>
            </Row>
            <Row label="Customer">
              <input value={customer ? `${customer.name}${customer.city ? ` · ${customer.city}` : ''}` : ''} readOnly />
            </Row>

            <Row label="Scheme" req>
              <select value={form.schemeCode} onChange={set('schemeCode')} required>
                <option value="">Select</option>
                {defs?.schemes.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Loan Type">
              <select value={form.loanType} onChange={set('loanType')}>
                <option value="NE">Non-EMI</option>
                <option value="E">EMI</option>
              </select>
            </Row>

            <Row label="Open Date" req>
              <input type="date" value={form.openDate} onChange={setOpenDate} required />
            </Row>
            <Row label="Trans. Date">
              <input type="date" value={form.transDate} onChange={set('transDate')} />
            </Row>

            <Row label="Period (months)" req>
              <input className="w-sm" type="number" min="1" value={form.periodMonths} onChange={setPeriod} required />
            </Row>
            <Row label="Due Date">
              <input type="date" value={form.dueDate} onChange={set('dueDate')} />
            </Row>

            <Row label="Purpose">
              <select value={form.purpose} onChange={set('purpose')}>
                {defs?.purposes.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Row>
            <Row label="Old Account No">
              <input value={form.oldAccNo} onChange={set('oldAccNo')} />
            </Row>
          </div>

          <Sep>Gold valuation</Sep>

          <div className="frm">
            <Row label="Market Rate /sov.">
              <input type="number" step="0.01" value={form.marketRate} onChange={setMarketRate} />
            </Row>
            <Row label="Rate / gram">
              <input type="number" step="0.01" value={form.ratePerGram} onChange={set('ratePerGram')} />
            </Row>
          </div>

          {/* the "add a jewel" row the old screen put above its grid */}
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table className="grid">
              <thead>
                <tr>
                  <th>Jewel</th>
                  <th style={{ width: 70 }}>Items</th>
                  <th style={{ width: 100 }}>Gross (g)</th>
                  <th style={{ width: 100 }}>Less (g)</th>
                  <th style={{ width: 100 }}>Net (g)</th>
                  <th style={{ width: 100 }}>Touch</th>
                  <th style={{ width: 110 }} className="right-align">
                    Rate / g
                  </th>
                  <th style={{ width: 120 }} className="right-align">
                    Value
                  </th>
                  <th style={{ width: 70 }} />
                </tr>
              </thead>
              <tbody>
                {totals.rows.map((j, i) => (
                  <tr key={i}>
                    <td>{j.description}</td>
                    <td>{j.items}</td>
                    <td>{j.grossWeight}</td>
                    <td>{j.deduction || 0}</td>
                    <td>{j.net}</td>
                    <td>{j.touch}</td>
                    <td className="right-align">{fmtMoney(j.ratePerGram)}</td>
                    <td className="right-align">{fmtMoney(j.value)}</td>
                    <td className="right-align">
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Remove"
                        onClick={() => setJewels((rows) => rows.filter((_, k) => k !== i))}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <input
                      className="cell-input"
                      list="jewel-types"
                      value={draft.description}
                      onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                      placeholder="Chain, bangle…"
                    />
                    <datalist id="jewel-types">
                      {defs?.jewelTypes.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </td>
                  <td>
                    <input
                      className="cell-input"
                      type="number"
                      min="1"
                      value={draft.items}
                      onChange={(e) => setDraft((d) => ({ ...d, items: e.target.value }))}
                    />
                  </td>
                  <td>
                    <input
                      className="cell-input"
                      type="number"
                      step="0.01"
                      value={draft.grossWeight}
                      onChange={(e) => setDraft((d) => ({ ...d, grossWeight: e.target.value }))}
                    />
                  </td>
                  <td>
                    <input
                      className="cell-input"
                      type="number"
                      step="0.01"
                      value={draft.deduction}
                      onChange={(e) => setDraft((d) => ({ ...d, deduction: e.target.value }))}
                    />
                  </td>
                  <td className="mono">{draftNet || ''}</td>
                  <td>
                    <select
                      className="cell-input"
                      value={draft.touch}
                      onChange={(e) => setDraft((d) => ({ ...d, touch: e.target.value }))}
                    >
                      {(defs?.touches || []).map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td className="right-align mono">{draftRate ? fmtMoney(draftRate) : ''}</td>
                  <td className="right-align mono">{draftValue ? fmtMoney(draftValue) : ''}</td>
                  <td className="right-align">
                    <button type="button" className="btn tiny primary" onClick={addJewel}>
                      Add
                    </button>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <th>Total</th>
                  <th>{totals.items}</th>
                  <th>{totals.gross}</th>
                  <th />
                  <th>{totals.net}</th>
                  <th colSpan={2} />
                  <th className="right-align">{fmtMoney(totals.value)}</th>
                  <th />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="frm-sep">
            <span>Jewel Photo</span>
          </div>
          <aside className="master-media">
            <ImageBox
              label="Jewel Photo"
              state={photo}
              shape="wide"
              onPick={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                try {
                  setPhoto({ src: await shrink(file), dirty: true })
                  setError('')
                } catch (err) {
                  setError(err.message)
                }
              }}
              onClear={() => setPhoto({ src: '', dirty: true })}
            />
          </aside>

          <Sep>Loan</Sep>

          <div className="frm">
            <Row label="Loan Amount" req>
              <input type="number" step="0.01" value={form.loanAmount} onChange={set('loanAmount')} required />
            </Row>
            <Row label="Jewel Value">
              <input value={fmtMoney(totals.value)} readOnly />
            </Row>

            <Row label="Interest Rate %" req>
              <input className="w-sm" type="number" step="0.01" value={form.interestRate} onChange={set('interestRate')} required />
            </Row>
            <Row label="Penal Rate %">
              <input className="w-sm" type="number" step="0.01" value={form.penalRate} onChange={set('penalRate')} />
            </Row>

            <Row label="Processing Fee">
              <input type="number" step="0.01" value={form.appraiserFee} onChange={set('appraiserFee')} />
            </Row>
            <Row label="Service Tax">
              <input type="number" step="0.01" value={form.serviceTax} onChange={set('serviceTax')} />
            </Row>

            <Row label="Insurance / month">
              <input type="number" step="0.01" value={form.insurancePerMonth} onChange={set('insurancePerMonth')} />
            </Row>
            <Row label="Forms">
              <input type="number" step="0.01" value={form.formsFee} onChange={set('formsFee')} />
            </Row>

            <Row label="Other Deductions">
              <input type="number" step="0.01" value={form.otherDeductions} onChange={set('otherDeductions')} />
            </Row>
            <Row label="Deductions">
              <input value={fmtMoney(deductions)} readOnly />
            </Row>

            <Row label="Disbursed Amount">
              <input value={fmtMoney(disbAmt)} readOnly />
            </Row>
            <Row label="Paid through">
              <select value={form.glCode} onChange={set('glCode')}>
                {defs?.glAccounts.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Row>
          </div>

          <Sep>Nominee and other details</Sep>

          <div className="frm">
            <Row label="Nominee Name">
              <input value={form.nomineeName} onChange={set('nomineeName')} />
            </Row>
            <Row label="Relation">
              <input value={form.nomineeRelation} onChange={set('nomineeRelation')} />
            </Row>

            <Row label="Age">
              <input className="w-sm" type="number" value={form.nomineeAge} onChange={set('nomineeAge')} />
            </Row>
            <Row label="Locker A/c No">
              <input value={form.lockerAccNo} onChange={set('lockerAccNo')} />
            </Row>

            <Row label="Referred By">
              <input value={form.referredByName} onChange={set('referredByName')} />
            </Row>
            <Row label="Staff loan">
              <label className="inline-check">
                <input type="checkbox" checked={form.isStaff} onChange={set('isStaff')} />
                This borrower is staff
              </label>
            </Row>

            <Row label="Narration" span={3}>
              <textarea rows={2} value={form.narration} onChange={set('narration')} />
            </Row>
          </div>
        </div>

        <div className="master-foot">
          <span className="req-hint muted">* required</span>
          <button type="button" className="btn ghost" onClick={() => navigate('jl-list')} disabled={busy}>
            Close
          </button>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {picking && (
        <CustomerPicker
          title="Find the borrower"
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
