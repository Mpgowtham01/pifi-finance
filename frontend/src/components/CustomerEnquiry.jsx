import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { fmtDate, fmtMoney, initials } from '../lib/format.js'
import CustomerPicker from './CustomerPicker.jsx'

// Customer_Enquiry.aspx rebuilt: the customer's details beside their photo, then
// the same one-row-per-account grid — Acc. Type, Acc. No, Open Date, Due Date,
// Period, Cl. Balance.
export default function CustomerEnquiry({ navigate, id }) {
  const [customer, setCustomer] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [accountTypes, setAccountTypes] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!!id)
  const [picking, setPicking] = useState(!id)
  const [lookupId, setLookupId] = useState('')

  useEffect(() => {
    if (!id) {
      setCustomer(null)
      setAccounts([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([api.get(`/customers/${id}`), api.get(`/customers/${id}/accounts`)])
      .then(([c, a]) => {
        if (cancelled) return
        setCustomer(c.customer)
        setAccounts(a.accounts)
        setAccountTypes(a.accountTypes)
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id])

  async function goToId(e) {
    e.preventDefault()
    const v = lookupId.trim()
    if (!v) return
    setError('')
    try {
      const { customer: c } = await api.get(`/customers/lookup/${encodeURIComponent(v)}`)
      navigate('customer-enquiry', { id: c.id })
    } catch (err) {
      setError(err.message)
    }
  }

  const total = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0)

  return (
    <div>
      <form className="toolbar" onSubmit={goToId}>
        <div className="input-with-btn" style={{ maxWidth: 320 }}>
          <input
            className="mono"
            placeholder="Customer Id"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
          />
          <button type="button" className="btn" onClick={() => setPicking(true)}>
            View Details
          </button>
        </div>
        <button className="btn" type="submit">
          Go
        </button>
        <div style={{ flex: 1 }} />
        {customer && (
          <>
            <button type="button" className="btn" onClick={() => navigate('customer-reports', { custId: customer.custId })}>
              Reports
            </button>
            <button type="button" className="btn primary" onClick={() => navigate('customer-edit', { id })}>
              Edit
            </button>
          </>
        )}
        <button type="button" className="btn ghost" onClick={() => navigate('customers')}>
          Close
        </button>
      </form>

      {error && <div className="notice error">{error}</div>}
      {loading && <div className="muted">Loading…</div>}

      {!loading && !customer && !error && (
        <div className="card">
          <div className="card-body muted">Pick a customer to see their details and accounts.</div>
        </div>
      )}

      {customer && (
        <>
          <div className="card enquiry-head">
            <div className="enquiry-identity">
              <div className="enquiry-photo">
                {customer.hasPhoto ? (
                  <img src={`/api/customers/${customer.id}/photo`} alt={customer.name} />
                ) : (
                  <span>{initials(customer.name)}</span>
                )}
              </div>
              <div className="enquiry-who">
                <div className="enquiry-id mono">{customer.custId}</div>
                <h2>{customer.name}</h2>
                <p className="muted">{[customer.address, customer.city, customer.pincode].filter(Boolean).join(', ') || '—'}</p>
                <div className="chip-row">
                  <span className={`badge ${customer.active ? 'ok' : 'off'}`}>
                    {customer.active ? 'Active' : 'In-active'}
                  </span>
                  <span className="badge neutral">{customer.customerType || 'Individual'}</span>
                  {customer.deductTds && <span className="badge warn">TDS</span>}
                  <span className="badge neutral">SMS {customer.smsOptIn ? 'Enabled' : 'Disabled'}</span>
                </div>
              </div>
            </div>
            {customer.hasJewelPhoto && (
              <div className="enquiry-jewel">
                <span className="muted">Jewel photo</span>
                <img src={`/api/customers/${customer.id}/jewel-photo`} alt="Jewel photo" />
              </div>
            )}
          </div>

          <div className="enquiry-cols">
            <div className="card">
              <div className="card-head">
                <strong>Customer details</strong>
              </div>
              <div className="card-body">
                <dl className="detail-list">
                  <Row k="Father / Spouse" v={customer.fatherOrGuardian} />
                  <Row k="DOB" v={fmtDate(customer.dob)} />
                  <Row k="Gender" v={{ M: 'Male', F: 'Female' }[customer.gender] || 'Unknown'} />
                  <Row k="Marital Status" v={{ M: 'Married', S: 'Single' }[customer.maritalStatus] || customer.maritalStatus} />
                  <Row k="Occupation" v={customer.occupation} />
                  <Row k="Phone" v={customer.phone} />
                  <Row k="Mobile" v={customer.mobile} />
                  <Row k="E-mail" v={customer.email} />
                  <Row k="Anniversary" v={fmtDate(customer.anniversaryDate)} />
                  <Row k="PAN No." v={customer.panNo} />
                  <Row k="Id Type" v={customer.idProofs?.[0]?.type} />
                  <Row k="Id No." v={customer.idProofs?.[0]?.number} />
                  <Row k="2nd Id Type" v={customer.idProofs?.[1]?.type} />
                  <Row k="2nd Id No." v={customer.idProofs?.[1]?.number} />
                  <Row k="Nominee" v={customer.nominee?.name} />
                  <Row k="Relationship" v={customer.nominee?.relation} />
                  <Row k="Introducer" v={[customer.introducerId, customer.introducerName].filter(Boolean).join(' — ')} />
                  <Row k="Address (Share)" v={[customer.permanentAddress, customer.permanentCity, customer.permanentPincode].filter(Boolean).join(', ')} />
                  <Row k="Remarks" v={customer.remarks} />
                </dl>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <strong>Accounts</strong>
                {accounts.length > 0 && (
                  <span className="muted">
                    Total Cl. Balance <strong style={{ color: 'var(--text)' }}>{fmtMoney(total)}</strong>
                  </span>
                )}
              </div>
              <div className="table-wrap">
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Acc. Type</th>
                      <th>Acc. No</th>
                      <th>Open Date</th>
                      <th>Due Date</th>
                      <th>Period</th>
                      <th className="right-align">Cl. Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.length === 0 && (
                      <tr>
                        <td colSpan={6} className="muted" style={{ padding: 24, textAlign: 'center' }}>
                          {accountTypes.length === 0
                            ? 'No product module is live yet, so there are no accounts to show. Share, Savings, Deposit and Loan accounts will appear here as those modules are built.'
                            : 'This customer holds no accounts.'}
                        </td>
                      </tr>
                    )}
                    {accounts.map((a, i) => (
                      <tr key={`${a.accType}-${a.accNo}-${i}`}>
                        <td>{a.accType}</td>
                        <td className="mono">{a.accNo}</td>
                        <td>{fmtDate(a.openDate)}</td>
                        <td>{fmtDate(a.dueDate)}</td>
                        <td>{a.period || '—'}</td>
                        <td className="right-align mono">{fmtMoney(a.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {picking && (
        <CustomerPicker
          title="Customer enquiry"
          onClose={() => setPicking(false)}
          onPick={(c) => {
            setPicking(false)
            setLookupId(c.custId)
            navigate('customer-enquiry', { id: c.id })
          }}
        />
      )}
    </div>
  )
}

function Row({ k, v }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v || '—'}</dd>
    </>
  )
}
