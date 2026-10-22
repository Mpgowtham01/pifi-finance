import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { fmtDate, fmtMoney } from '../lib/format.js'
import { emitReport } from '../lib/report.js'
import CustomerPicker from './CustomerPicker.jsx'

// Customer_Reports.aspx rebuilt. Same four reports, same filters, same three
// output formats — PDF (print), Excel and Word.
const FORMATS = ['PDF', 'Excel', 'Word']
// The old reports print an account's status as a single letter.
const statusCode = (s) => (s === 'Close' ? 'C' : s === 'Active' ? 'A' : s || '')
const fullAddress = (c) =>
  [c.address, [c.city, c.pincode].filter(Boolean).join('- ')].filter(Boolean).join(', ')
const SCHEME_TYPES = [
  { v: 'JL', t: 'JL — Jewel loan' },
  { v: 'OTH', t: 'OTH — Other' },
  { v: 'SD', t: 'SD — Savings / Deposit' },
]

export default function CustomerReports({ navigate, custId: initialCustId = '' }) {
  const [custId, setCustId] = useState(initialCustId)
  const [custInfo, setCustInfo] = useState('')
  const [format, setFormat] = useState('PDF')
  const [schemeType, setSchemeType] = useState('')
  const [statusActive, setStatusActive] = useState(true)
  const [statusClose, setStatusClose] = useState(false)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    if (initialCustId) lookup(initialCustId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCustId])

  async function lookup(value) {
    const v = String(value ?? custId).trim()
    if (!v) {
      setCustInfo('')
      return null
    }
    try {
      const { customer } = await api.get(`/customers/lookup/${encodeURIComponent(v)}`)
      setCustId(customer.custId)
      setCustInfo(`${customer.name}${customer.city ? ` — ${customer.city}` : ''}`)
      setError('')
      return customer
    } catch (e) {
      setCustInfo('')
      setError(e.message)
      return null
    }
  }

  // One wrapper so every button reports its own errors and never leaves a
  // spinner stuck on.
  async function run(key, fn) {
    setBusy(key)
    setError('')
    setInfo('')
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  // The old Crystal report prints these six columns, in this order.
  const accountColumns = [
    { label: 'Scheme', value: (r) => r.scheme || r.accType },
    { label: 'Account No.', value: (r) => r.accNo },
    { label: 'Open Date', value: (r) => fmtDate(r.openDate) },
    { label: 'Period', value: (r) => r.period },
    { label: 'Amount', value: (r) => fmtMoney(r.balance), align: 'right' },
    { label: 'Status', value: (r) => statusCode(r.status) },
  ]

  function accountsReport() {
    return run('accounts', async () => {
      if (!custId.trim()) throw new Error('Enter a customer id first.')
      const statuses = [statusActive && 'Active', statusClose && 'Close'].filter(Boolean)
      if (!statuses.length) throw new Error('Tick at least one A/c status.')
      const qs = new URLSearchParams({ custId: custId.trim(), status: statuses.join(','), schemeType })
      const r = await api.get(`/customers/reports/accounts?${qs}`)
      setCustInfo(`${r.customer.name}${r.customer.city ? ` — ${r.customer.city}` : ''}`)
      // An empty report is still a report — the old system prints the header
      // and an empty body rather than refusing.
      if (!r.accounts.length) {
        setInfo(
          r.accountTypes.length === 0
            ? 'No product module is live yet, so the report comes out with no account rows.'
            : 'No accounts match those filters — the report comes out empty.'
        )
      }
      await emitReport(format, {
        title: 'Customer-wise Accounts',
        fileName: 'Customer-wise_Accounts',
        branch: r.branch,
        meta: [
          ['Customer Id', r.customer.custId],
          ['Customer Name', r.customer.name],
          ['Address', fullAddress(r.customer)],
          ['Mobile No', r.customer.mobile],
        ],
        columns: accountColumns,
        rows: r.accounts,
      })
    })
  }

  function cardReport() {
    return run('card', async () => {
      if (!custId.trim()) throw new Error('Enter a customer id first.')
      const r = await api.get(`/customers/reports/card?custId=${encodeURIComponent(custId.trim())}`)
      const c = r.customer
      const pairs = [
        ['Customer Id', c.custId],
        ['Name', c.name],
        ['Father / Spouse', c.fatherOrGuardian],
        ['Date of Birth', fmtDate(c.dob)],
        ['Gender', { M: 'Male', F: 'Female' }[c.gender] || 'Unknown'],
        ['Marital Status', { M: 'Married', S: 'Single' }[c.maritalStatus] || c.maritalStatus],
        ['Customer Type', c.customerType],
        ['Occupation', c.occupation],
        ['Address', [c.address, c.city, c.pincode].filter(Boolean).join(', ')],
        ['Address (Share)', [c.permanentAddress, c.permanentCity, c.permanentPincode].filter(Boolean).join(', ')],
        ['Phone', c.phone],
        ['Mobile', c.mobile],
        ['E-mail', c.email],
        ['Anniversary', fmtDate(c.anniversaryDate)],
        ['PAN No.', c.panNo],
        ['Id Type', c.idProofs?.[0]?.type],
        ['Id No.', c.idProofs?.[0]?.number],
        ['2nd Id Type', c.idProofs?.[1]?.type],
        ['2nd Id No.', c.idProofs?.[1]?.number],
        ['Nominee', c.nominee?.name],
        ['Relationship', c.nominee?.relation],
        ['Introducer', [c.introducerId, c.introducerName].filter(Boolean).join(' — ')],
        ['SMS Feature', c.smsOptIn ? 'Enabled' : 'Disabled'],
        ['Deduct TDS', c.deductTds ? 'Yes' : 'No'],
        ['Status', c.active ? 'Active' : 'In-active'],
        ['Remarks', c.remarks],
        ...r.accounts.map((a) => [`${a.accType} ${a.accNo}`, `Cl. Balance ${fmtMoney(a.balance)}`]),
      ]
      await emitReport(format, {
        title: 'Customer Card',
        fileName: 'Customer_Card',
        branch: r.branch,
        meta: [
          ['Customer Id', c.custId],
          ['Customer Name', c.name],
        ],
        columns: [
          { label: 'Field', value: (r2) => r2[0] },
          { label: 'Value', value: (r2) => r2[1] },
        ],
        rows: pairs.filter((p) => p[1]),
      })
    })
  }

  function staffReport() {
    return run('staff', async () => {
      const r = await api.get('/customers/reports/staff-accounts')
      if (!r.rows.length) setInfo('No customer in this branch is recorded as Staff — the report comes out empty.')
      await emitReport(format, {
        title: 'Staff A/c List',
        fileName: 'Staff_Ac_List',
        branch: r.branch,
        columns: [
          { label: 'Cust. Id', value: (x) => x.custId },
          { label: 'Name', value: (x) => x.name },
          { label: 'City', value: (x) => x.city },
          { label: 'Mobile', value: (x) => x.mobile },
          { label: 'Acc. Type', value: (x) => x.accType },
          { label: 'Acc. No', value: (x) => x.accNo },
          { label: 'Open Date', value: (x) => fmtDate(x.openDate) },
          { label: 'Cl. Balance', value: (x) => (x.balance == null ? '' : fmtMoney(x.balance)), align: 'right' },
        ],
        rows: r.rows,
      })
    })
  }

  function inactiveReport() {
    return run('inactive', async () => {
      const r = await api.get('/customers/reports/inactive')
      if (!r.rows.length) setInfo('Every customer in this branch is active — the report comes out empty.')
      await emitReport(format, {
        title: 'In-Active Customers',
        fileName: 'In-Active_Customers',
        branch: r.branch,
        columns: [
          { label: 'Cust. Id', value: (x) => x.custId },
          { label: 'Name', value: (x) => x.name },
          { label: 'Father / Spouse', value: (x) => x.fatherOrGuardian },
          { label: 'Address', value: (x) => x.address },
          { label: 'City', value: (x) => x.city },
          { label: 'Pincode', value: (x) => x.pincode },
          { label: 'Mobile', value: (x) => x.mobile },
        ],
        rows: r.rows,
      })
    })
  }

  return (
    <div>
      <div className="toolbar">
        <div style={{ flex: 1 }} />
        <div className="field inline-field">
          <label>Report Type</label>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            {FORMATS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </div>
        <button type="button" className="btn ghost" onClick={() => navigate('customers')}>
          Close
        </button>
      </div>

      {error && <div className="notice error">{error}</div>}
      {info && <div className="notice">{info}</div>}
      <p className="muted" style={{ marginTop: -6 }}>
        Every report downloads as a file, the same way the old system issued them.
      </p>

      <div className="card">
        <div className="card-head">
          <strong>List of A/c&apos;s for Customer</strong>
        </div>
        <div className="card-body">
          <div className="frm">
            <label className="lbl">Customer Id</label>
            <div className="cell">
              <div className="input-with-btn">
                <input
                  className="mono"
                  value={custId}
                  onChange={(e) => setCustId(e.target.value)}
                  onBlur={() => lookup()}
                />
                <button type="button" className="btn" onClick={() => setPicking(true)}>
                  View Details
                </button>
              </div>
            </div>
            <label className="lbl">Name</label>
            <div className="cell">
              <input value={custInfo} readOnly placeholder="—" />
            </div>

            <label className="lbl">Scheme Type</label>
            <div className="cell">
              <select value={schemeType} onChange={(e) => setSchemeType(e.target.value)}>
                <option value="">All</option>
                {SCHEME_TYPES.map((s) => (
                  <option key={s.v} value={s.v}>
                    {s.t}
                  </option>
                ))}
              </select>
            </div>
            <label className="lbl">A/c Status</label>
            <div className="cell">
              <div className="check-row">
                <label className="inline-check">
                  <input type="checkbox" checked={statusActive} onChange={(e) => setStatusActive(e.target.checked)} />
                  Active
                </label>
                <label className="inline-check">
                  <input type="checkbox" checked={statusClose} onChange={(e) => setStatusClose(e.target.checked)} />
                  Close
                </label>
              </div>
            </div>
          </div>
          <div className="form-foot left">
            <button type="button" className="btn primary" onClick={accountsReport} disabled={!!busy}>
              {busy === 'accounts' ? 'Working…' : 'Report'}
            </button>
          </div>
        </div>
      </div>

      <div className="report-grid">
        <ReportTile
          title="Customer Card"
          note="Everything held about the customer above, on one sheet."
          busy={busy === 'card'}
          disabled={!!busy}
          onRun={cardReport}
        />
        <ReportTile
          title="Staff A/c List"
          note="Every customer recorded as Staff, with their accounts."
          busy={busy === 'staff'}
          disabled={!!busy}
          onRun={staffReport}
        />
        <ReportTile
          title="In-Active Customers"
          note="Customers whose status is In-active in this branch."
          busy={busy === 'inactive'}
          disabled={!!busy}
          onRun={inactiveReport}
        />
      </div>

      {picking && (
        <CustomerPicker
          title="Pick a customer"
          onClose={() => setPicking(false)}
          onPick={(c) => {
            setPicking(false)
            setCustId(c.custId)
            setCustInfo(`${c.name}${c.city ? ` — ${c.city}` : ''}`)
            setError('')
          }}
        />
      )}
    </div>
  )
}

function ReportTile({ title, note, busy, disabled, onRun }) {
  return (
    <div className="card report-tile">
      <div className="card-body">
        <h3>{title}</h3>
        <p className="muted">{note}</p>
        <button type="button" className="btn" onClick={onRun} disabled={disabled}>
          {busy ? 'Working…' : 'Report'}
        </button>
      </div>
    </div>
  )
}
