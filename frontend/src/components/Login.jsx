import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { company } from '../company.js'

export default function Login({ onDone }) {
  const [branches, setBranches] = useState([])
  const [needsSetup, setNeedsSetup] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', branch: '', name: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('/auth/needs-setup').then((r) => setNeedsSetup(r.needsSetup)).catch(() => {})
    api
      .get('/auth/branches')
      .then((r) => {
        setBranches(r.branches)
        if (r.branches[0]) setForm((f) => ({ ...f, branch: r.branches[0].id }))
      })
      .catch(() => {})
  }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (needsSetup) {
        await api.post('/auth/bootstrap', {
          username: form.username,
          name: form.name,
          password: form.password,
        })
        // Fresh admin created — now sign in (needs a branch; seed creates them).
        setNeedsSetup(false)
        if (form.branch) {
          await api.post('/auth/login', {
            username: form.username,
            password: form.password,
            branch: form.branch,
          })
          onDone()
        } else {
          setError('Owner account created. Run the branch seed, then sign in.')
        }
      } else {
        await api.post('/auth/login', form)
        onDone()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="head">
          <img className="logo" src={company.logo} alt="" />
          <h1>{needsSetup ? 'Create the owner account' : company.name}</h1>
          <p>{needsSetup ? 'This becomes the admin for the whole system.' : 'Sign in to your branch'}</p>
        </div>
        <div className="body">
          {error && <div className="notice error">{error}</div>}

          {needsSetup && (
            <div className="field">
              <label>Full name <span className="req">*</span></label>
              <input value={form.name} onChange={set('name')} required autoFocus />
            </div>
          )}

          <div className="field">
            <label>Username <span className="req">*</span></label>
            <input value={form.username} onChange={set('username')} required autoComplete="username" />
          </div>

          <div className="field">
            <label>Password <span className="req">*</span></label>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              required
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
            />
          </div>

          {!needsSetup && (
            <div className="field">
              <label>Branch <span className="req">*</span></label>
              <select value={form.branch} onChange={set('branch')} required>
                {branches.length === 0 && <option value="">No branches — run the seed</option>}
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button className="btn primary" disabled={busy} style={{ justifyContent: 'center' }}>
            {busy ? 'Please wait…' : needsSetup ? 'Create & sign in' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  )
}
