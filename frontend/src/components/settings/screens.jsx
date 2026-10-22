import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../api.js'
import { dateInput, fmtDate, fmtMoney } from '../../lib/format.js'
import { useSettingsOptions } from './masters.jsx'

// The Settings screens that are not a plain form-over-list master.

/* --------------------------------------------------------- shared pieces */

function Shell({ title, note, children, foot, error, ok }) {
  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>{title}</h2>
            {note && <p className="muted">{note}</p>}
          </div>
          <div className="master-head-right">
            <span className="master-date">{fmtDate(new Date())}</span>
          </div>
        </header>
        <div className="master-body">
          {error && <div className="notice error">{error}</div>}
          {ok && <div className="notice success">{ok}</div>}
          {children}
        </div>
        {foot && <footer className="master-foot">{foot}</footer>}
      </div>
    </div>
  )
}

const Row = ({ label, children, span }) => (
  <>
    <label className="lbl">{label}</label>
    <div className={`cell${span > 1 ? ` span-${span}` : ''}`}>{children}</div>
  </>
)

// Loads a record once, tracks edits, and saves it back.
function useRecord(path, key, initial) {
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get(path)
      .then((r) => setForm((f) => ({ ...f, ...r[key] })))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [path, key])

  const save = async (payload) => {
    setBusy(true)
    setError('')
    setOk('')
    try {
      const r = await api.put(path, payload ?? form)
      setForm((f) => ({ ...f, ...r[key] }))
      setOk('Saved.')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  return { form, setForm, set, save, error, setError, ok, busy, loading }
}

/* ---------------------------------------------------------- Branch Master */

export function BranchMaster() {
  const r = useRecord('/settings/branch', 'branch', {
    code: '', name: '', companyName: '', address: '', city: '', pincode: '', phone: '',
  })
  if (r.loading) return <div className="muted">Loading…</div>
  return (
    <Shell
      title="Branch Master"
      note="The branch you are signed in to. Its address is what the reports print."
      error={r.error}
      ok={r.ok}
      foot={
        <button className="btn primary" onClick={() => r.save()} disabled={r.busy}>
          {r.busy ? 'Saving…' : 'Save'}
        </button>
      }
    >
      <div className="frm">
        <Row label="Branch Code">
          <input className="mono w-sm" value={r.form.code} readOnly />
        </Row>
        <Row label="Branch Name">
          <input value={r.form.name} onChange={r.set('name')} />
        </Row>
        <Row label="Company Name" span={3}>
          <input value={r.form.companyName} onChange={r.set('companyName')} />
        </Row>
        <Row label="Address" span={3}>
          <textarea rows={2} value={r.form.address} onChange={r.set('address')} />
        </Row>
        <Row label="City">
          <input value={r.form.city} onChange={r.set('city')} />
        </Row>
        <Row label="Pincode">
          <input className="w-sm" value={r.form.pincode} onChange={r.set('pincode')} maxLength={6} />
        </Row>
        <Row label="Phone">
          <input value={r.form.phone} onChange={r.set('phone')} />
        </Row>
      </div>
    </Shell>
  )
}

/* ------------------------------------------------------- General Settings */

export function GeneralSettings() {
  const r = useRecord('/settings/general', 'settings', {
    cashAccountNo: '', pandlAccountNo: '', aoAccountNo: '', aoBranchCode: '',
    cashTranLimit: 0, depositLimit: 0, tdsLimit: 0, tdsPercentage: 0,
    smsEnabled: true, chequeOption: false, directPrint: false, allowOdLoan: false, monthEndPosting: false,
  })
  const options = useSettingsOptions()
  if (r.loading) return <div className="muted">Loading…</div>

  const glSelect = (k) => (
    <select value={r.form[k] ?? ''} onChange={r.set(k)}>
      <option value="">Select</option>
      {(options.glAccounts || []).map((g) => (
        <option key={g.code} value={g.code}>
          {g.code}-{g.name}
        </option>
      ))}
    </select>
  )

  return (
    <Shell
      title="General Settings"
      note="Branch-wide limits and switches."
      error={r.error}
      ok={r.ok}
      foot={
        <button className="btn primary" onClick={() => r.save()} disabled={r.busy}>
          {r.busy ? 'Saving…' : 'Save'}
        </button>
      }
    >
      <div className="frm">
        <Row label="Cash Account No.">{glSelect('cashAccountNo')}</Row>
        <Row label="PandL Account No">{glSelect('pandlAccountNo')}</Row>
        <Row label="AO Account No.">{glSelect('aoAccountNo')}</Row>
        <Row label="AO Branch Code">
          <input value={r.form.aoBranchCode} onChange={r.set('aoBranchCode')} />
        </Row>
        <Row label="Cash Tran. Limit">
          <input type="number" value={r.form.cashTranLimit} onChange={r.set('cashTranLimit')} />
        </Row>
        <Row label="Deposit Limit">
          <input type="number" value={r.form.depositLimit} onChange={r.set('depositLimit')} />
        </Row>
        <Row label="TDS Limit">
          <input type="number" value={r.form.tdsLimit} onChange={r.set('tdsLimit')} />
        </Row>
        <Row label="TDS Percentage">
          <input type="number" value={r.form.tdsPercentage} onChange={r.set('tdsPercentage')} />
        </Row>
        <Row label="SMS Feature">
          <select
            value={r.form.smsEnabled ? 'Y' : 'N'}
            onChange={(e) => r.setForm((f) => ({ ...f, smsEnabled: e.target.value === 'Y' }))}
          >
            <option value="Y">Enabled</option>
            <option value="N">Disabled</option>
          </select>
        </Row>
        <Row label="Cheque Option">
          <label className="inline-check">
            <input type="checkbox" checked={r.form.chequeOption} onChange={r.set('chequeOption')} />
            Allow cheque transactions
          </label>
        </Row>
        <Row label="Direct Print">
          <label className="inline-check">
            <input type="checkbox" checked={r.form.directPrint} onChange={r.set('directPrint')} />
            Print receipts without a preview
          </label>
        </Row>
        <Row label="Allow OD Loan">
          <label className="inline-check">
            <input type="checkbox" checked={r.form.allowOdLoan} onChange={r.set('allowOdLoan')} />
            Permit overdraft loans
          </label>
        </Row>
        <Row label="Month End Posting">
          <label className="inline-check">
            <input type="checkbox" checked={r.form.monthEndPosting} onChange={r.set('monthEndPosting')} />
            Post interest at month end
          </label>
        </Row>
      </div>
    </Shell>
  )
}

/* ---------------------------------------------------- GL Opening Balance */

export function OpeningBalances() {
  const [rows, setRows] = useState([])
  const [dirty, setDirty] = useState(() => new Set())
  const [asOn, setAsOn] = useState(dateInput(new Date()))
  const [term, setTerm] = useState('')
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get(`/settings/opening-balances?q=${encodeURIComponent(q)}`)
      setRows(r.rows)
      setDirty(new Set())
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [q])

  useEffect(() => {
    load()
  }, [load])

  function edit(glCode, key, value) {
    setRows((rs) => rs.map((r) => (r.glCode === glCode ? { ...r, [key]: value } : r)))
    setDirty((d) => new Set(d).add(glCode))
  }

  async function save() {
    setBusy(true)
    setError('')
    setOk('')
    try {
      const changed = rows.filter((r) => dirty.has(r.glCode))
      const res = await api.put('/settings/opening-balances', { asOn, rows: changed })
      setOk(`${res.saved} account${res.saved === 1 ? '' : 's'} saved.`)
      setDirty(new Set())
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const total = useMemo(
    () => rows.reduce((s, r) => s + (r.type === 'Dr' ? -1 : 1) * (Number(r.amount) || 0), 0),
    [rows]
  )

  return (
    <Shell
      title="GL Opening Balance"
      note="What this branch carried on each account when the books opened."
      error={error}
      ok={ok}
      foot={
        <>
          <span className="muted req-hint">
            {dirty.size ? `${dirty.size} unsaved change${dirty.size === 1 ? '' : 's'}` : 'No changes'} · Cr − Dr ={' '}
            <strong style={{ color: 'var(--text)' }}>{fmtMoney(total)}</strong>
          </span>
          <button className="btn primary" onClick={save} disabled={busy || dirty.size === 0}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="frm" style={{ marginBottom: 14 }}>
        <Row label="Date">
          <input type="date" value={asOn} onChange={(e) => setAsOn(e.target.value)} />
        </Row>
        <Row label="Filter A/c's">
          <form
            className="input-with-btn"
            onSubmit={(e) => {
              e.preventDefault()
              setQ(term.trim())
            }}
          >
            <input placeholder="GL code or name…" value={term} onChange={(e) => setTerm(e.target.value)} />
            <button className="btn" type="submit">
              Go
            </button>
          </form>
        </Row>
      </div>

      <div className="table-wrap">
        <table className="grid compact">
          <thead>
            <tr>
              <th style={{ width: 100 }}>Account Code</th>
              <th>Account Name</th>
              <th style={{ width: 150 }} className="right-align">
                Opening Balance
              </th>
              <th style={{ width: 90 }}>Cr./Dr.</th>
              <th style={{ width: 150 }} className="right-align">
                Sanction Limit
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: 20, textAlign: 'center' }}>
                  Loading…
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.glCode} className={dirty.has(r.glCode) ? 'row-editing' : undefined}>
                <td className="mono">{r.glCode}</td>
                <td>{r.glName}</td>
                <td className="right-align">
                  <input
                    className="cell-input right-align"
                    type="number"
                    step="any"
                    value={r.amount}
                    onChange={(e) => edit(r.glCode, 'amount', e.target.value)}
                  />
                </td>
                <td>
                  <select
                    className="cell-input"
                    value={r.type}
                    onChange={(e) => edit(r.glCode, 'type', e.target.value)}
                  >
                    <option>Cr</option>
                    <option>Dr</option>
                  </select>
                </td>
                <td className="right-align">
                  <input
                    className="cell-input right-align"
                    type="number"
                    step="any"
                    value={r.sanctionLimit}
                    onChange={(e) => edit(r.glCode, 'sanctionLimit', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  )
}

/* ------------------------------------------------------- Calendar Settings */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function CalendarSettings() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [holidays, setHolidays] = useState([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [picked, setPicked] = useState(null)
  const [description, setDescription] = useState('')
  const [allBranches, setAllBranches] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/settings/holidays?year=${year}`)
      setHolidays(r.rows)
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [year])

  useEffect(() => {
    load()
  }, [load])

  const byDay = useMemo(() => {
    const m = new Map()
    for (const h of holidays) m.set(dateInput(h.date), h)
    return m
  }, [holidays])

  const first = new Date(year, month, 1)
  const startPad = first.getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const cells = [
    ...Array.from({ length: startPad }, () => null),
    ...Array.from({ length: days }, (_, i) => new Date(year, month, i + 1)),
  ]

  async function add() {
    if (!picked) return
    setBusy(true)
    setError('')
    setOk('')
    try {
      await api.post('/settings/holidays', { date: picked, description, allBranches })
      setOk('Holiday saved.')
      setPicked(null)
      setDescription('')
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id) {
    setError('')
    try {
      await api.del(`/settings/holidays/${id}`)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <Shell
      title="Calendar Settings"
      note="The days the branch does not transact on. Click a day to mark it."
      error={error}
      ok={ok}
    >
      <div className="cal-head">
        <button className="btn" onClick={() => (month === 0 ? (setMonth(11), setYear(year - 1)) : setMonth(month - 1))}>
          ‹
        </button>
        <strong>
          {MONTHS[month]} {year}
        </strong>
        <button className="btn" onClick={() => (month === 11 ? (setMonth(0), setYear(year + 1)) : setMonth(month + 1))}>
          ›
        </button>
      </div>

      <div className="cal-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`p${i}`} className="cal-day empty" />
          const key = dateInput(d)
          const h = byDay.get(key)
          const isSunday = d.getDay() === 0
          return (
            <button
              key={key}
              type="button"
              className={`cal-day${h ? ' holiday' : ''}${isSunday ? ' sunday' : ''}${picked === key ? ' picked' : ''}`}
              onClick={() => {
                setPicked(key)
                setDescription(h?.description || '')
              }}
              title={h?.description || ''}
            >
              <span className="cal-num">{d.getDate()}</span>
              {h && <span className="cal-note">{h.description || 'Holiday'}</span>}
            </button>
          )
        })}
      </div>

      {picked && (
        <div className="frm" style={{ marginTop: 18 }}>
          <Row label="Date">
            <input value={fmtDate(picked)} readOnly className="w-md" />
          </Row>
          <Row label="Description">
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Pongal, Local holiday…" />
          </Row>
          <Row label="Applies to">
            <label className="inline-check">
              <input type="checkbox" checked={allBranches} onChange={(e) => setAllBranches(e.target.checked)} />
              Every branch
            </label>
          </Row>
          <div className="frm-actions">
            <button className="btn primary" onClick={add} disabled={busy}>
              {busy ? 'Saving…' : 'Mark as holiday'}
            </button>
            {byDay.get(picked) && (
              <button className="btn danger" onClick={() => remove(byDay.get(picked).id)} disabled={busy}>
                Remove
              </button>
            )}
            <button className="btn ghost" onClick={() => setPicked(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Shell>
  )
}

/* ------------------------------------------------------- User Registration */

export function UserRegistration() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ empId: '', name: '', username: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setRows((await api.get('/settings/users')).rows)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setOk('')
    try {
      await api.post('/settings/users', form)
      setOk(`User "${form.username}" created.`)
      setForm({ empId: '', name: '', username: '', password: '', confirm: '' })
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function toggle(u) {
    setError('')
    try {
      await api.put(`/settings/users/${u.id}`, { active: !u.active })
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="master">
      <div className="card">
        <header className="master-head">
          <div>
            <h2>User Registration</h2>
            <p className="muted">New staff accounts. They can sign in to the branch you are in.</p>
          </div>
          <div className="master-head-right">
            <span className="master-date">{fmtDate(new Date())}</span>
          </div>
        </header>
        <div className="master-body">
          {error && <div className="notice error">{error}</div>}
          {ok && <div className="notice success">{ok}</div>}
          <form className="frm" onSubmit={save}>
            <Row label="Emp. Id">
              <input className="mono" value={form.empId} onChange={set('empId')} />
            </Row>
            <Row label="Emp. Name">
              <input value={form.name} onChange={set('name')} required />
            </Row>
            <Row label="User Id">
              <input className="mono" value={form.username} onChange={set('username')} required minLength={3} />
            </Row>
            <Row label="Password">
              <input type="password" value={form.password} onChange={set('password')} required minLength={6} />
            </Row>
            <Row label="Re-enter Password">
              <input type="password" value={form.confirm} onChange={set('confirm')} required minLength={6} />
            </Row>
            <div className="frm-actions">
              <button className="btn primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <strong>{rows.length} user{rows.length === 1 ? '' : 's'}</strong>
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Emp. Id</th>
                <th>Name</th>
                <th>User Id</th>
                <th>Role</th>
                <th>Status</th>
                <th className="right-align">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td className="mono">{u.empId || '—'}</td>
                  <td>{u.name}</td>
                  <td className="mono">{u.username}</td>
                  <td>{u.role}</td>
                  <td>
                    <span className={`badge ${u.active ? 'ok' : 'off'}`}>{u.active ? 'Active' : 'In-active'}</span>
                  </td>
                  <td className="right-align">
                    <button type="button" className="btn tiny" onClick={() => toggle(u)}>
                      {u.active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------- Change Password */

export function ChangePassword({ session }) {
  const [form, setForm] = useState({ username: '', currentPassword: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const self = !form.username.trim() || form.username.trim().toLowerCase() === session?.user?.username

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setOk('')
    try {
      await api.post('/settings/change-password', form)
      setOk('Password changed.')
      setForm({ username: '', currentPassword: '', password: '', confirm: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell title="Change Password" note="Leave the user id blank to change your own." error={error} ok={ok}>
      <form className="frm" onSubmit={submit}>
        <Row label="User Id">
          <input
            className="mono"
            value={form.username}
            onChange={set('username')}
            placeholder={session?.user?.username}
          />
        </Row>
        {self && (
          <Row label="Current Password">
            <input type="password" value={form.currentPassword} onChange={set('currentPassword')} required />
          </Row>
        )}
        <Row label="New Password">
          <input type="password" value={form.password} onChange={set('password')} required minLength={6} />
        </Row>
        <Row label="Re-enter New Password">
          <input type="password" value={form.confirm} onChange={set('confirm')} required minLength={6} />
        </Row>
        <div className="frm-actions">
          <button className="btn primary" disabled={busy}>
            {busy ? 'Changing…' : 'Change Password'}
          </button>
        </div>
      </form>
    </Shell>
  )
}

/* ------------------------------------------------------ Permission Settings */

export function PermissionSettings({ session }) {
  const [modules, setModules] = useState([])
  const [users, setUsers] = useState([])
  const [userId, setUserId] = useState('')
  const [perms, setPerms] = useState({})
  const [branches, setBranches] = useState([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([api.get('/settings/permission-modules'), api.get('/settings/users')])
      .then(([m, u]) => {
        setModules(m.modules)
        setUsers(u.rows)
      })
      .catch((e) => setError(e.message))
  }, [])

  function choose(id) {
    setUserId(id)
    setOk('')
    const u = users.find((x) => x.id === id)
    setPerms(u?.permissions || {})
    setBranches(u?.branches || [])
  }

  const has = (mod, action) => (perms[mod] || []).includes(action)
  function toggle(mod, action) {
    setPerms((p) => {
      const cur = new Set(p[mod] || [])
      cur.has(action) ? cur.delete(action) : cur.add(action)
      return { ...p, [mod]: [...cur] }
    })
  }
  function toggleBranch(id) {
    setBranches((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id]))
  }

  async function save() {
    setBusy(true)
    setError('')
    setOk('')
    try {
      await api.put(`/settings/users/${userId}`, { permissions: perms, branches })
      setOk('Permissions saved.')
      setUsers((us) => us.map((u) => (u.id === userId ? { ...u, permissions: perms, branches } : u)))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const chosen = users.find((u) => u.id === userId)

  return (
    <Shell
      title="Permission Settings"
      note="What each user may do, and the branches they may sign in to."
      error={error}
      ok={ok}
      foot={
        userId && (
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        )
      }
    >
      <div className="frm">
        <Row label="User Id">
          <select value={userId} onChange={(e) => choose(e.target.value)}>
            <option value="">Select a user</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username} — {u.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Branch">
          <div className="check-row wrap">
            {(session?.branches || []).map((b) => (
              <label key={b.id} className="inline-check">
                <input
                  type="checkbox"
                  checked={branches.includes(b.id)}
                  onChange={() => toggleBranch(b.id)}
                  disabled={!userId}
                />
                {b.label}
              </label>
            ))}
          </div>
        </Row>
      </div>

      {chosen?.role === 'admin' && (
        <div className="notice" style={{ marginTop: 16 }}>
          {chosen.username} is an admin and may do everything, whatever is ticked below.
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="grid perm-grid">
          <thead>
            <tr>
              <th>Module</th>
              {['View', 'Save', 'Update', 'Delete', 'Verify', 'Reports'].map((a) => (
                <th key={a} style={{ textAlign: 'center' }}>
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m.key}>
                <td>{m.label}</td>
                {['View', 'Save', 'Update', 'Delete', 'Verify', 'Reports'].map((a) => (
                  <td key={a} style={{ textAlign: 'center' }}>
                    {m.actions.includes(a) ? (
                      <input
                        type="checkbox"
                        checked={has(m.key, a)}
                        onChange={() => toggle(m.key, a)}
                        disabled={!userId}
                      />
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  )
}

/* -------------------------------------------------------- Interest Provision */

const PROVISION_PRODUCTS = [
  { key: 'SD', label: 'SD' },
  { key: 'FD', label: 'FD' },
  { key: 'FD_TDS', label: 'TDS FD' },
  { key: 'RD', label: 'RD' },
  { key: 'RD_TDS', label: 'TDS RD' },
  { key: 'JL', label: 'JL' },
  { key: 'OL', label: 'OL' },
]

export function InterestProvision() {
  const [picked, setPicked] = useState([])
  const [date, setDate] = useState(dateInput(new Date()))
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))

  async function run() {
    setBusy(true)
    setError('')
    setOk('')
    try {
      const r = await api.post('/settings/interest-provision', { products: picked, date })
      setOk(r.message || 'Done.')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell
      title="Interest Provision"
      note="The month-end run that provisions interest on deposits and loans."
      error={error}
      ok={ok}
      foot={
        <button className="btn primary" onClick={run} disabled={busy || picked.length === 0}>
          {busy ? 'Running…' : 'Go'}
        </button>
      }
    >
      <div className="frm">
        <Row label="Products" span={3}>
          <div className="check-row wrap">
            {PROVISION_PRODUCTS.map((p) => (
              <label key={p.key} className="inline-check">
                <input type="checkbox" checked={picked.includes(p.key)} onChange={() => toggle(p.key)} />
                {p.label}
              </label>
            ))}
          </div>
        </Row>
        <Row label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Row>
      </div>
      <p className="muted" style={{ marginTop: 16 }}>
        The run needs the deposit and loan modules, which are not built yet — it will tell you so rather than
        post anything.
      </p>
    </Shell>
  )
}
