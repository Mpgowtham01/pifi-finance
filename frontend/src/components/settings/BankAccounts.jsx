import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api.js'
import { fmtDate } from '../../lib/format.js'
import { useSettingsOptions } from './masters.jsx'

// The old "List of Bank Accounts" screen picked a GL account from a dropdown
// and added it to a list. A bank account is not a separate record here — it is
// a GL account carrying a flag — so this screen sets and clears that flag.
export default function BankAccounts() {
  const options = useSettingsOptions()
  const [rows, setRows] = useState([])
  const [glCode, setGlCode] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/settings/gl-accounts?isBankAccount=true')
      setRows(r.rows)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function add(e) {
    e.preventDefault()
    if (!glCode) return
    setBusy(true)
    setError('')
    setOk('')
    try {
      const found = (await api.get(`/settings/gl-accounts?code=${encodeURIComponent(glCode)}`)).rows[0]
      if (!found) throw new Error('No GL account with that code.')
      if (found.isBankAccount) throw new Error(`${found.code}-${found.name} is already on the list.`)
      await api.put(`/settings/gl-accounts/${found.id}`, { isBankAccount: true })
      setOk(`${found.code}-${found.name} added.`)
      setGlCode('')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(row) {
    setError('')
    setOk('')
    try {
      await api.put(`/settings/gl-accounts/${row.id}`, { isBankAccount: false })
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
            <h2>List of Bank Accounts</h2>
            <p className="muted">The GL accounts the branch treats as bank accounts.</p>
          </div>
          <div className="master-head-right">
            <span className="master-date">{fmtDate(new Date())}</span>
          </div>
        </header>
        <div className="master-body">
          {error && <div className="notice error">{error}</div>}
          {ok && <div className="notice success">{ok}</div>}
          <form className="frm" onSubmit={add}>
            <label className="lbl">GL Name</label>
            <div className="cell span-3">
              <select value={glCode} onChange={(e) => setGlCode(e.target.value)} required>
                <option value="">Select a GL account</option>
                {(options.glAccounts || []).map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.code}-{g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="frm-actions">
              <button className="btn primary" disabled={busy || !glCode}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <strong>{loading ? 'Loading…' : `${rows.length} bank account${rows.length === 1 ? '' : 's'}`}</strong>
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 120 }}>GL Code</th>
                <th>GL Name</th>
                <th className="right-align">Action</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted" style={{ padding: 24, textAlign: 'center' }}>
                    No GL account is marked as a bank account yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.code}</td>
                  <td>{r.name}</td>
                  <td className="right-align">
                    <button type="button" className="icon-btn danger" title="Remove" onClick={() => remove(r)}>
                      🗑
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
