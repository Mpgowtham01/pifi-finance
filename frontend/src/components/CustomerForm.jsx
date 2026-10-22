import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { ageFrom, dateInput, fmtDate } from '../lib/format.js'
import CustomerPicker from './CustomerPicker.jsx'

// Customer_Master.aspx rebuilt: the same compact label-left, two-column sheet,
// the same field order, the same option lists — restyled. The data has to stay
// compatible with the old system, so the option values below are verbatim.
const MARITAL = [
  { v: '', t: 'Select' },
  { v: 'M', t: 'M-Married' },
  { v: 'S', t: 'S-Single' },
  { v: 'U', t: 'U-Unknown' },
]
const GENDERS = [
  { v: '', t: 'Select' },
  { v: 'M', t: 'M-Male' },
  { v: 'F', t: 'F-Female' },
  { v: 'U', t: 'U-Unknown' },
]
const CUST_TYPES = ['Individual', 'Business', 'Staff', 'Director', 'Others']
const OCCUPATIONS = ['Others', 'Agriculture', 'Business', 'Working', 'Self-employed']
const ID_TYPES = ['Voter ID', 'Licence NO', 'Aadhaar Card']
const RELATIONS = [
  'Father', 'Mother', 'Son', 'Daughter', 'Wife', 'Husband',
  'Brother', 'Sister', 'Grand-Son', 'Grand-Daughter',
]

const blankProof = { type: '', number: '', issueDate: '', issuePlace: '' }
const blank = {
  name: '', address: '', city: '', pincode: '',
  permanentAddress: '', permanentCity: '', permanentPincode: '', sameAsAddress: false,
  fatherOrGuardian: '', maritalStatus: '', gender: '', dob: '',
  customerType: 'Individual', occupation: 'Others',
  phone: '', mobile: '', email: '', anniversaryDate: '',
  idProofs: [{ ...blankProof, type: 'Aadhaar Card' }, { ...blankProof }],
  panNo: '', deductTds: false,
  introducerId: '', introducerName: '',
  nominee: { name: '', relation: '', age: '', dob: '' },
  remarks: '', smsOptIn: true, active: true,
}

export default function CustomerForm({ navigate, id }) {
  const editing = !!id
  const [form, setForm] = useState(blank)
  const [custId, setCustId] = useState('')
  const [photo, setPhoto] = useState({ src: '', dirty: false })
  const [jewelPhoto, setJewelPhoto] = useState({ src: '', dirty: false })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(editing)
  const [picking, setPicking] = useState(false)
  const topRef = useRef(null)

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
          gender: customer.gender || '',
          dob: dateInput(customer.dob),
          anniversaryDate: dateInput(customer.anniversaryDate),
          idProofs: [0, 1].map((i) => ({
            type: ip[i]?.type || '',
            number: ip[i]?.number || '',
            issueDate: dateInput(ip[i]?.issueDate),
            issuePlace: ip[i]?.issuePlace || '',
          })),
          nominee: {
            name: customer.nominee?.name || '',
            relation: customer.nominee?.relation || '',
            age: customer.nominee?.age ?? '',
            dob: dateInput(customer.nominee?.dob),
          },
        })
        if (customer.hasPhoto) setPhoto({ src: `/api/customers/${id}/photo`, dirty: false })
        if (customer.hasJewelPhoto) setJewelPhoto({ src: `/api/customers/${id}/jewel-photo`, dirty: false })
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [editing, id])

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [k]: v }))
  }
  const setNum = (k, max) => (e) => setForm((f) => ({ ...f, [k]: digits(e.target.value, max) }))
  const setNominee = (k) => (e) =>
    setForm((f) => {
      const nominee = { ...f.nominee, [k]: e.target.value }
      // The old form filled the age box from the nominee's date of birth.
      if (k === 'dob') nominee.age = ageFrom(e.target.value) || nominee.age
      return { ...f, nominee }
    })
  const setProof = (i, k) => (e) =>
    setForm((f) => ({
      ...f,
      idProofs: f.idProofs.map((p, idx) => (idx === i ? { ...p, [k]: e.target.value } : p)),
    }))

  // "Copy Address" mirrors the residence block into the share block, and keeps
  // it in step for as long as the box stays ticked.
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
  const setAddr = (k, mirror, max) => (e) => {
    const v = max ? digits(e.target.value, max) : e.target.value
    setForm((f) => ({ ...f, [k]: v, ...(f.sameAsAddress ? { [mirror]: v } : null) }))
  }

  async function onImage(e, apply) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      apply({ src: await shrink(file), dirty: true })
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function lookupIntroducer(value) {
    const v = String(value || '').trim()
    if (!v) return setForm((f) => ({ ...f, introducerName: '' }))
    try {
      const { customer } = await api.get(`/customers/lookup/${encodeURIComponent(v)}`)
      setForm((f) => ({ ...f, introducerId: customer.custId, introducerName: customer.name }))
    } catch {
      setForm((f) => ({ ...f, introducerName: '' }))
    }
  }

  async function save(e) {
    e.preventDefault()
    setError('')
    setOk('')
    setBusy(true)
    try {
      const payload = {
        ...form,
        gender: form.gender || 'U', // the model only stores M / F / U
        dob: form.dob || null,
        anniversaryDate: form.anniversaryDate || null,
        idProofs: form.idProofs
          .filter((p) => p.type || p.number)
          .map((p) => ({ ...p, issueDate: p.issueDate || null })),
        nominee: {
          ...form.nominee,
          dob: form.nominee.dob || null,
          age: form.nominee.age === '' ? undefined : Number(form.nominee.age),
        },
      }
      if (photo.dirty) payload.photo = photo.src || ''
      if (jewelPhoto.dirty) payload.jewelPhoto = jewelPhoto.src || ''

      if (editing) {
        await api.put(`/customers/${id}`, payload)
        setPhoto((p) => ({ ...p, dirty: false }))
        setJewelPhoto((s) => ({ ...s, dirty: false }))
        setOk('Saved.')
        topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else {
        const { customer } = await api.post('/customers', payload)
        navigate('customer-enquiry', { id: customer.id })
      }
    } catch (err) {
      setError(err.message)
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="muted">Loading…</div>

  return (
    <form onSubmit={save} ref={topRef} className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>Customer Master</h2>
            <p className="muted">
              {editing ? `${custId} · ${form.name || 'Customer'}` : 'New customer — the id is issued on save'}
            </p>
          </div>
          <div className="master-head-right">
            <span className="master-date">{fmtDate(new Date())}</span>
            {editing && (
              <button type="button" className="btn tiny" onClick={() => navigate('customer-enquiry', { id })}>
                Enquiry
              </button>
            )}
          </div>
        </header>

        <div className="master-body">
          {error && <div className="notice error">{error}</div>}
          {ok && <div className="notice success">{ok}</div>}

          <div className="master-split">
            <div className="frm">
              <Row label="Customer Id" req span={3}>
                <input className="mono w-md" value={custId || 'Auto'} readOnly tabIndex={-1} />
              </Row>
              <Row label="Customer Name" req span={3}>
                <input value={form.name} onChange={set('name')} required maxLength={120} autoFocus={!editing} />
              </Row>
              <Row label="Address" span={3}>
                <textarea value={form.address} onChange={setAddr('address', 'permanentAddress')} rows={2} />
              </Row>
              <Row label="City" req>
                <input value={form.city} onChange={setAddr('city', 'permanentCity')} required />
              </Row>
              <Row label="Pincode">
                <input
                  className="w-sm"
                  value={form.pincode}
                  onChange={setAddr('pincode', 'permanentPincode', 6)}
                  inputMode="numeric"
                  maxLength={6}
                />
              </Row>

              <Row label={<>Address <small>(Share)</small></>} req span={3}>
                <div className="cell-inline">
                  <textarea
                    value={form.permanentAddress}
                    onChange={set('permanentAddress')}
                    rows={2}
                    readOnly={form.sameAsAddress}
                    required
                  />
                  <label className="inline-check nowrap">
                    <input type="checkbox" checked={form.sameAsAddress} onChange={copyAddress} />
                    Copy Address
                  </label>
                </div>
              </Row>
              <Row label="City" req>
                <input
                  value={form.permanentCity}
                  onChange={set('permanentCity')}
                  readOnly={form.sameAsAddress}
                  required
                />
              </Row>
              <Row label="Pincode">
                <input
                  className="w-sm"
                  value={form.permanentPincode}
                  onChange={setNum('permanentPincode', 6)}
                  inputMode="numeric"
                  maxLength={6}
                  readOnly={form.sameAsAddress}
                />
              </Row>
            </div>

            <aside className="master-media">
              <ImageBox
                label="Photo"
                state={photo}
                shape="portrait"
                onPick={(e) => onImage(e, setPhoto)}
                onClear={() => setPhoto({ src: '', dirty: true })}
              />
              <ImageBox
                label="Jewel Photo"
                state={jewelPhoto}
                shape="wide"
                onPick={(e) => onImage(e, setJewelPhoto)}
                onClear={() => setJewelPhoto({ src: '', dirty: true })}
              />
            </aside>
          </div>

          <div className="frm">
            <Sep>Personal</Sep>
            <Row label="Father / Spouse">
              <input value={form.fatherOrGuardian} onChange={set('fatherOrGuardian')} />
            </Row>
            <Row label="Marital Status">
              <select value={form.maritalStatus} onChange={set('maritalStatus')}>
                {MARITAL.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.t}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Gender">
              <select value={form.gender} onChange={set('gender')}>
                {GENDERS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.t}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Date of Birth" req>
              <input type="date" value={form.dob} onChange={set('dob')} required />
            </Row>
            <Row label="Customer Type">
              <select value={form.customerType} onChange={set('customerType')}>
                {CUST_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Row>
            <Row label="Occupation">
              <select value={form.occupation} onChange={set('occupation')}>
                {OCCUPATIONS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Row>
            <Row label="Phone">
              <input value={form.phone} onChange={set('phone')} inputMode="tel" />
            </Row>
            <Row label="Mobile" req>
              <input value={form.mobile} onChange={setNum('mobile', 15)} inputMode="tel" required />
            </Row>
            <Row label="Email">
              <input type="email" value={form.email} onChange={set('email')} />
            </Row>
            <Row label="Anniversary Date">
              <input type="date" value={form.anniversaryDate} onChange={set('anniversaryDate')} />
            </Row>

            <Sep>Identity &amp; nominee</Sep>
            <Row label="1. Proof of Identity">
              <select value={form.idProofs[0].type} onChange={setProof(0, 'type')}>
                {ID_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Row>
            <Row label="Id Proof No." req>
              <input value={form.idProofs[0].number} onChange={setProof(0, 'number')} required />
            </Row>
            <Row label="2. Proof of Address">
              <select value={form.idProofs[1].type} onChange={setProof(1, 'type')}>
                <option value="">Select</option>
                {ID_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Row>
            <Row label="Id Proof No.">
              <input value={form.idProofs[1].number} onChange={setProof(1, 'number')} />
            </Row>
            <Row label="PAN No.">
              <input
                className="mono w-md"
                value={form.panNo}
                onChange={(e) => setForm((f) => ({ ...f, panNo: e.target.value.toUpperCase() }))}
                maxLength={10}
              />
            </Row>
            <Row label="">
              <label className="inline-check">
                <input type="checkbox" checked={form.deductTds} onChange={set('deductTds')} />
                Deduct TDS
              </label>
            </Row>
            <Row label="Introducer Id">
              <div className="input-with-btn">
                <input
                  className="mono"
                  value={form.introducerId}
                  onChange={set('introducerId')}
                  onBlur={(e) => lookupIntroducer(e.target.value)}
                />
                <button type="button" className="btn" onClick={() => setPicking(true)}>
                  Search
                </button>
              </div>
            </Row>
            <Row label="Introducer Name">
              <input value={form.introducerName} readOnly placeholder="—" />
            </Row>
            <Row label="Nominee Name">
              <input value={form.nominee.name} onChange={setNominee('name')} />
            </Row>
            <Row label="Relationship">
              <select value={form.nominee.relation} onChange={setNominee('relation')}>
                <option value="">Select</option>
                {RELATIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Row>
            <Row label="Nominee DOB">
              <input type="date" value={form.nominee.dob} onChange={setNominee('dob')} />
            </Row>
            <Row label="Nominee Age">
              <input
                className="w-sm"
                value={form.nominee.age}
                onChange={(e) => setNominee('age')({ target: { value: digits(e.target.value, 3) } })}
                inputMode="numeric"
              />
            </Row>

            <Sep>Other</Sep>
            <Row label="Remarks" span={3}>
              <input value={form.remarks} onChange={set('remarks')} />
            </Row>
            <Row label="SMS Feature">
              <select
                value={form.smsOptIn ? 'Y' : 'N'}
                onChange={(e) => setForm((f) => ({ ...f, smsOptIn: e.target.value === 'Y' }))}
              >
                <option value="Y">Enabled</option>
                <option value="N">Disabled</option>
              </select>
            </Row>
            <Row label="Status">
              <select
                value={form.active ? 'A' : 'I'}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === 'A' }))}
              >
                <option value="A">Active</option>
                <option value="I">In-active</option>
              </select>
            </Row>
          </div>
        </div>

        <footer className="master-foot">
          <span className="muted req-hint">
            <span className="req">*</span> required
          </span>
          <button type="button" className="btn ghost" onClick={() => navigate('customers')}>
            Close
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>

      {picking && (
        <CustomerPicker
          title="Find the introducer"
          onClose={() => setPicking(false)}
          onPick={(c) => {
            setForm((f) => ({ ...f, introducerId: c.custId, introducerName: c.name }))
            setPicking(false)
          }}
        />
      )}
    </form>
  )
}

// One label cell plus its control cell, so every row lines up on the same grid.
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

function ImageBox({ label, state, onPick, onClear, shape }) {
  return (
    <div className={`image-box ${shape}`}>
      <span className="image-label">{label}</span>
      <label className="image-frame" title={`Upload ${label.toLowerCase()}`}>
        {state.src ? (
          <img src={state.src} alt={label} />
        ) : (
          <span className="image-empty">
            <span className="image-plus">+</span>
            Add {label.toLowerCase()}
          </span>
        )}
        <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onPick} />
      </label>
      {state.src && (
        <button type="button" className="btn tiny ghost" onClick={onClear}>
          Remove
        </button>
      )}
    </div>
  )
}

const digits = (v, max) => String(v).replace(/\D/g, '').slice(0, max)

// Scale an uploaded image down before it ever leaves the browser, so photos
// stay small enough to live beside the customer record.
function shrink(file, maxSide = 640, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      return reject(new Error('Pick a PNG, JPEG or WebP image.'))
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('That file could not be read.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That file is not a readable image.'))
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
