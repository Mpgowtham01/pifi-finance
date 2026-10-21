import { useEffect, useState } from 'react'
import { api } from '../api.js'

const ID_TYPES = ['Aadhaar Card', 'Voter ID', 'Driving Licence', 'Passport', 'PAN', 'Ration Card']
const RELATIONS = ['Father', 'Mother', 'Husband', 'Wife', 'Son', 'Daughter', 'Brother', 'Sister', 'Guardian', 'Other']
const OCCUPATIONS = ['Agriculture', 'Business', 'Self-employed', 'Salaried', 'Staff', 'Professional', 'Retired', 'Other']
const CUST_TYPES = ['Individual', 'Joint', 'Minor', 'Proprietor', 'Firm', 'Company', 'Trust', 'Other']

const blank = {
  name: '', fatherOrGuardian: '', relation: '', gender: 'U', dob: '', maritalStatus: '',
  occupation: '', customerType: 'Individual', anniversaryDate: '',
  address: '', city: '', pincode: '', phone: '', mobile: '', email: '',
  permanentAddress: '', permanentCity: '', permanentPincode: '', sameAsAddress: false,
  panNo: '',
  idProofs: [
    { type: '', number: '', issueDate: '', issuePlace: '' },
    { type: '', number: '', issueDate: '', issuePlace: '' },
  ],
  nominee: { name: '', dob: '', age: '', relation: '' },
  introducerId: '', introducerName: '', smsOptIn: true, deductTds: false, remarks: '',
}

function dateVal(d) {
  return d ? String(d).slice(0, 10) : ''
}

export default function CustomerForm({ navigate, id }) {
  const editing = !!id
  const [form, setForm] = useState(blank)
  const [custId, setCustId] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(editing)

  useEffect(() => {
    if (!editing) return
    api
      .get(`/customers/${id}`)
      .then(({ customer }) => {
        setCustId(customer.custId)
        const ip = customer.idProofs?.length ? customer.idProofs : blank.idProofs
        setForm({
          ...blank,
          ...customer,
          dob: dateVal(customer.dob),
          anniversaryDate: dateVal(customer.anniversaryDate),
          idProofs: [0, 1].map((i) => ({
            type: ip[i]?.type || '',
            number: ip[i]?.number || '',
            issueDate: dateVal(ip[i]?.issueDate),
            issuePlace: ip[i]?.issuePlace || '',
          })),
          nominee: {
            name: customer.nominee?.name || '',
            dob: dateVal(customer.nominee?.dob),
            age: customer.nominee?.age ?? '',
            relation: customer.nominee?.relation || '',
          },
        })
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [editing, id])

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [k]: v }))
  }
  const setNominee = (k) => (e) => setForm((f) => ({ ...f, nominee: { ...f.nominee, [k]: e.target.value } }))
  const setProof = (i, k) => (e) =>
    setForm((f) => {
      const idProofs = f.idProofs.map((p, idx) => (idx === i ? { ...p, [k]: e.target.value } : p))
      return { ...f, idProofs }
    })

  function copyAddress(e) {
    const on = e.target.checked
    setForm((f) => ({
      ...f,
      sameAsAddress: on,
      permanentAddress: on ? f.address : f.permanentAddress,
      permanentCity: on ? f.city : f.permanentCity,
      permanentPincode: on ? f.pincode : f.permanentPincode,
    }))
  }

  async function save(e) {
    e.preventDefault()
    setError('')
    setOk('')
    setBusy(true)
    try {
      const payload = {
        ...form,
        dob: form.dob || null,
        anniversaryDate: form.anniversaryDate || null,
        idProofs: form.idProofs.filter((p) => p.type || p.number).map((p) => ({ ...p, issueDate: p.issueDate || null })),
        nominee: {
          ...form.nominee,
          dob: form.nominee.dob || null,
          age: form.nominee.age === '' ? undefined : Number(form.nominee.age),
        },
      }
      if (editing) {
        await api.put(`/customers/${id}`, payload)
        setOk('Saved.')
      } else {
        const { customer } = await api.post('/customers', payload)
        navigate('customer-edit', { id: customer.id })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="muted">Loading…</div>

  return (
    <form onSubmit={save}>
      <div className="toolbar">
        <button type="button" className="btn ghost" onClick={() => navigate('customers')}>
          ‹ Back
        </button>
        <div style={{ flex: 1 }}>
          {editing && (
            <span className="muted">
              Customer ID <strong style={{ color: 'var(--text)' }}>{custId}</strong>
            </span>
          )}
        </div>
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create customer'}
        </button>
      </div>

      {error && <div className="notice error">{error}</div>}
      {ok && <div className="notice success">{ok}</div>}

      <div className="card">
        <div className="card-body">
          <div className="section-title">Personal details</div>
          <div className="form-grid">
            <Field label="Name" req>
              <input value={form.name} onChange={set('name')} required />
            </Field>
            <Field label="Father / Guardian">
              <input value={form.fatherOrGuardian} onChange={set('fatherOrGuardian')} />
            </Field>
            <Field label="Relation">
              <select value={form.relation} onChange={set('relation')}>
                <option value="">—</option>
                {RELATIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Gender">
              <select value={form.gender} onChange={set('gender')}>
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="U">Unspecified</option>
              </select>
            </Field>
            <Field label="Date of birth">
              <input type="date" value={form.dob} onChange={set('dob')} />
            </Field>
            <Field label="Marital status">
              <select value={form.maritalStatus} onChange={set('maritalStatus')}>
                <option value="">—</option>
                <option>Single</option>
                <option>Married</option>
                <option>Other</option>
              </select>
            </Field>
            <Field label="Occupation">
              <select value={form.occupation} onChange={set('occupation')}>
                <option value="">—</option>
                {OCCUPATIONS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Field>
            <Field label="Customer type">
              <select value={form.customerType} onChange={set('customerType')}>
                {CUST_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Anniversary date">
              <input type="date" value={form.anniversaryDate} onChange={set('anniversaryDate')} />
            </Field>
          </div>

          <div className="section-title">Contact</div>
          <div className="form-grid">
            <Field label="Address">
              <input value={form.address} onChange={set('address')} />
            </Field>
            <Field label="City / Town">
              <input value={form.city} onChange={set('city')} />
            </Field>
            <Field label="Pincode">
              <input value={form.pincode} onChange={set('pincode')} />
            </Field>
            <Field label="Mobile">
              <input value={form.mobile} onChange={set('mobile')} />
            </Field>
            <Field label="Phone">
              <input value={form.phone} onChange={set('phone')} />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={set('email')} />
            </Field>
          </div>

          <div className="section-title">Permanent address</div>
          <div className="field check" style={{ marginBottom: 12 }}>
            <input id="same" type="checkbox" checked={form.sameAsAddress} onChange={copyAddress} />
            <label htmlFor="same">Same as address above</label>
          </div>
          <div className="form-grid">
            <Field label="Permanent address">
              <input value={form.permanentAddress} onChange={set('permanentAddress')} disabled={form.sameAsAddress} />
            </Field>
            <Field label="Permanent city">
              <input value={form.permanentCity} onChange={set('permanentCity')} disabled={form.sameAsAddress} />
            </Field>
            <Field label="Permanent pincode">
              <input value={form.permanentPincode} onChange={set('permanentPincode')} disabled={form.sameAsAddress} />
            </Field>
          </div>

          <div className="section-title">Identity</div>
          <div className="form-grid">
            <Field label="PAN number">
              <input value={form.panNo} onChange={set('panNo')} style={{ textTransform: 'uppercase' }} />
            </Field>
          </div>
          {form.idProofs.map((p, i) => (
            <div className="form-grid" key={i} style={{ marginTop: 8 }}>
              <Field label={`ID proof ${i + 1} — type`}>
                <select value={p.type} onChange={setProof(i, 'type')}>
                  <option value="">—</option>
                  {ID_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Number">
                <input value={p.number} onChange={setProof(i, 'number')} />
              </Field>
              <Field label="Issue date">
                <input type="date" value={p.issueDate} onChange={setProof(i, 'issueDate')} />
              </Field>
              <Field label="Issue place">
                <input value={p.issuePlace} onChange={setProof(i, 'issuePlace')} />
              </Field>
            </div>
          ))}

          <div className="section-title">Nominee</div>
          <div className="form-grid">
            <Field label="Nominee name">
              <input value={form.nominee.name} onChange={setNominee('name')} />
            </Field>
            <Field label="Relation">
              <select value={form.nominee.relation} onChange={setNominee('relation')}>
                <option value="">—</option>
                {RELATIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Date of birth">
              <input type="date" value={form.nominee.dob} onChange={setNominee('dob')} />
            </Field>
            <Field label="Age">
              <input type="number" value={form.nominee.age} onChange={setNominee('age')} />
            </Field>
          </div>

          <div className="section-title">Introducer & options</div>
          <div className="form-grid">
            <Field label="Introducer ID">
              <input value={form.introducerId} onChange={set('introducerId')} />
            </Field>
            <Field label="Introducer name">
              <input value={form.introducerName} onChange={set('introducerName')} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
            <div className="field check">
              <input id="sms" type="checkbox" checked={form.smsOptIn} onChange={set('smsOptIn')} />
              <label htmlFor="sms">Send SMS alerts</label>
            </div>
            <div className="field check">
              <input id="tds" type="checkbox" checked={form.deductTds} onChange={set('deductTds')} />
              <label htmlFor="tds">Deduct TDS</label>
            </div>
          </div>

          <div className="section-title">Remarks</div>
          <div className="field">
            <textarea value={form.remarks} onChange={set('remarks')} />
          </div>
        </div>
      </div>
    </form>
  )
}

function Field({ label, req, children }) {
  return (
    <div className="field">
      <label>
        {label} {req && <span className="req">*</span>}
      </label>
      {children}
    </div>
  )
}
