import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { company } from '../company.js'

// The first screen anyone sees of this software, so it carries the company
// rather than a bare box: the crest and the name on one side, the sign-in on
// the other. The branch is chosen here because it scopes every record behind
// it — a clerk signing in to Nagercoil never sees Kovilpatti's books.

// What is behind the sign-in, named so a new clerk knows where they landed.
const MODULES = ['Customers', 'Shares', 'Savings', 'Term Deposits', 'Jewel Loans', 'Vouchers', 'Reports']

export default function Login({ onDone }) {
  const [branches, setBranches] = useState([])
  const [needsSetup, setNeedsSetup] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', branch: '', name: '' })
  const [showPassword, setShowPassword] = useState(false)
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
      <div className="login-shell">
        <aside className="login-aside">
          <div className="login-brand">
            <img className="crest" src={company.logo} alt="" />
            <div>
              <h1>{company.name}</h1>
              <span>Branch back-office</span>
            </div>
          </div>

          <p className="lede">
            The branch back-office — members, deposits, jewel loans and the day&rsquo;s books, in one place.
          </p>

          <div className="login-modules">
            {MODULES.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>

          <div className="login-foot">
            <span className="dot" aria-hidden="true" />
            {branches.length > 0
              ? `${branches.length} branch${branches.length === 1 ? '' : 'es'} on this system`
              : 'Connecting…'}
          </div>
        </aside>

        <main className="login-main">
          <h2>{needsSetup ? 'Create the owner account' : 'Sign in'}</h2>
          <p className="sub">
            {needsSetup
              ? 'This becomes the admin for the whole system.'
              : 'Your branch is chosen here and scopes everything you see.'}
          </p>

          <form onSubmit={submit}>
            {error && <div className="notice error">{error}</div>}

            {needsSetup && (
              <div className="field">
                <label htmlFor="lg-name">
                  Full name <span className="req">*</span>
                </label>
                <input id="lg-name" value={form.name} onChange={set('name')} required autoFocus />
              </div>
            )}

            <div className="field">
              <label htmlFor="lg-user">
                Username <span className="req">*</span>
              </label>
              <input
                id="lg-user"
                value={form.username}
                onChange={set('username')}
                required
                autoComplete="username"
                autoFocus={!needsSetup}
                placeholder="200001"
              />
            </div>

            <div className="field pw-field">
              <label htmlFor="lg-pass">
                Password <span className="req">*</span>
              </label>
              <input
                id="lg-pass"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                required
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide the password' : 'Show the password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            {!needsSetup && (
              <div className="field">
                <label htmlFor="lg-branch">
                  Branch <span className="req">*</span>
                </label>
                <select id="lg-branch" value={form.branch} onChange={set('branch')} required>
                  {branches.length === 0 && <option value="">No branches — run the seed</option>}
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button className="btn primary" disabled={busy}>
              {busy ? 'Please wait…' : needsSetup ? 'Create & sign in' : 'Sign in'}
            </button>
          </form>

          <p className="login-hint">
            {needsSetup
              ? 'Keep these details safe — the owner account can create every other user.'
              : 'Signed in somewhere else? Signing in here does not sign that out.'}
          </p>
        </main>
      </div>
    </div>
  )
}
