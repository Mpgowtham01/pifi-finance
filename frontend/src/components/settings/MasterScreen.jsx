import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../api.js'
import { dateInput, fmtDate, fmtMoney } from '../../lib/format.js'

// Most Settings screens in the old system are one screen: a small form on top,
// a searchable list under it, and update / delete on each row. This renders
// that screen from a description of the fields and the columns.
//
// field: { name, label, type, options, required, readOnly, width, placeholder }
//   type: text | number | date | select | checkbox
// column: { key, label, align, fmt }
export default function MasterScreen({
  title,
  note,
  endpoint,
  fields,
  columns,
  searchable = true,
  searchPlaceholder = 'Search…',
  canDelete = true,
  canEdit = true,
  options = {},
  blank: blankOverride,
}) {
  const blank = useMemo(
    () => blankOverride || Object.fromEntries(fields.map((f) => [f.name, f.type === 'checkbox' ? false : ''])),
    [fields, blankOverride]
  )

  const [rows, setRows] = useState([])
  const [form, setForm] = useState(blank)
  const [editId, setEditId] = useState(null)
  const [term, setTerm] = useState('')
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [confirmDel, setConfirmDel] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get(`${endpoint}${endpoint.includes('?') ? '&' : '?'}q=${encodeURIComponent(q)}`)
      setRows(r.rows)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [endpoint, q])

  useEffect(() => {
    load()
  }, [load])

  function reset() {
    setForm(blank)
    setEditId(null)
    setOk('')
  }

  function edit(row) {
    const next = {}
    for (const f of fields) {
      const v = row[f.name]
      next[f.name] = f.type === 'checkbox' ? !!v : f.type === 'date' ? dateInput(v) : v ?? ''
    }
    setForm(next)
    setEditId(row.id)
    setOk('')
    setError('')
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setOk('')
    try {
      const payload = {}
      for (const f of fields) {
        const v = form[f.name]
        payload[f.name] = f.type === 'number' ? (v === '' ? 0 : Number(v)) : v
      }
      if (editId) await api.put(`${endpoint}/${editId}`, payload)
      else await api.post(endpoint, payload)
      setOk(editId ? 'Updated.' : 'Saved.')
      reset()
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError('')
    try {
      await api.del(`${endpoint}/${confirmDel.id}`)
      setConfirmDel(null)
      if (editId === confirmDel.id) reset()
      load()
    } catch (err) {
      setError(err.message)
      setConfirmDel(null)
    } finally {
      setBusy(false)
    }
  }

  const set = (f) => (e) =>
    setForm((s) => ({ ...s, [f.name]: f.type === 'checkbox' ? e.target.checked : e.target.value }))

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

          <form className="frm" onSubmit={save}>
            {fields.map((f) => (
              <Fragment key={f.name} field={f} value={form[f.name]} onChange={set(f)} options={options} />
            ))}
            <div className="frm-actions">
              <button className="btn primary" disabled={busy}>
                {busy ? 'Saving…' : editId ? 'Update' : 'Save'}
              </button>
              {editId && (
                <button type="button" className="btn ghost" onClick={reset}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <strong>{loading ? 'Loading…' : `${rows.length} record${rows.length === 1 ? '' : 's'}`}</strong>
          {searchable && (
            <form
              className="head-search"
              onSubmit={(e) => {
                e.preventDefault()
                setQ(term.trim())
              }}
            >
              <input placeholder={searchPlaceholder} value={term} onChange={(e) => setTerm(e.target.value)} />
              <button className="btn" type="submit">
                Go
              </button>
              {q && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setTerm('')
                    setQ('')
                  }}
                >
                  Clear
                </button>
              )}
            </form>
          )}
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={c.align === 'right' ? 'right-align' : undefined}>
                    {c.label}
                  </th>
                ))}
                {(canEdit || canDelete) && <th className="right-align">Action</th>}
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="muted" style={{ padding: 24, textAlign: 'center' }}>
                    Nothing here yet.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className={editId === row.id ? 'row-editing' : undefined}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.align === 'right' ? 'right-align' : undefined}>
                      {cell(row, c)}
                    </td>
                  ))}
                  {(canEdit || canDelete) && (
                    <td className="right-align">
                      <div className="row-actions">
                        {canEdit && (
                          <button type="button" className="icon-btn" title="Edit" onClick={() => edit(row)}>
                            ✎
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            className="icon-btn danger"
                            title="Delete"
                            onClick={() => setConfirmDel(row)}
                          >
                            🗑
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {confirmDel && (
        <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setConfirmDel(null)}>
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-head">Delete</div>
            <div className="modal-body">
              <p style={{ margin: 0 }}>
                Delete <strong>{cell(confirmDel, columns[1] || columns[0])}</strong>? This cannot be undone.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setConfirmDel(null)} disabled={busy}>
                Cancel
              </button>
              <button className="btn danger" onClick={remove} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function cell(row, c) {
  if (!c) return ''
  const v = row[c.key]
  if (c.fmt === 'date') return fmtDate(v)
  if (c.fmt === 'money') return fmtMoney(v)
  if (c.fmt === 'yesno') return v ? 'Yes' : 'No'
  if (typeof c.render === 'function') return c.render(row)
  return v === '' || v === null || v === undefined ? '—' : String(v)
}

// One label cell plus its control, on the shared settings grid.
function Fragment({ field: f, value, onChange, options }) {
  const list = typeof f.options === 'string' ? options[f.options] || [] : f.options || []
  return (
    <>
      <label className="lbl">
        {f.label}
        {f.required && <span className="req"> *</span>}
      </label>
      <div className={`cell${f.wide ? ' span-3' : ''}`}>
        {f.type === 'select' ? (
          <select value={value ?? ''} onChange={onChange} required={f.required} disabled={f.readOnly}>
            <option value="">Select</option>
            {list.map((o) => {
              const val = typeof o === 'string' ? o : o.value ?? o.code
              const text = typeof o === 'string' ? o : o.label ?? (o.name ? `${o.code}-${o.name}` : o.code)
              return (
                <option key={val} value={val}>
                  {text}
                </option>
              )
            })}
          </select>
        ) : f.type === 'checkbox' ? (
          <label className="inline-check">
            <input type="checkbox" checked={!!value} onChange={onChange} disabled={f.readOnly} />
            {f.hint || 'Yes'}
          </label>
        ) : (
          <input
            type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
            step={f.type === 'number' ? 'any' : undefined}
            value={value ?? ''}
            onChange={onChange}
            required={f.required}
            readOnly={f.readOnly}
            placeholder={f.placeholder}
            maxLength={f.maxLength}
            className={f.mono ? 'mono' : undefined}
          />
        )}
      </div>
    </>
  )
}
