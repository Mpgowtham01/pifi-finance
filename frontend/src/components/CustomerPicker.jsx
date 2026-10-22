import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'

// The old app's backbone interaction: a Customer-Id box with a "View Details"
// button that opened a modal, let you search, and filled the id back into the
// form. Same flow here, restyled.
export default function CustomerPicker({ title = 'Find a customer', onPick, onClose }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!q.trim()) {
      setRows([])
      return
    }
    const t = setTimeout(async () => {
      setBusy(true)
      setError('')
      try {
        const r = await api.get(`/customers/search?q=${encodeURIComponent(q.trim())}`)
        setRows(r.customers)
      } catch (e) {
        setError(e.message)
      } finally {
        setBusy(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">{title}</div>
        <div className="modal-body">
          <div className="search">
            <input
              ref={inputRef}
              placeholder="Customer id, name, mobile or city…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && onClose()}
            />
          </div>
          {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}
          <div className="picker-results">
            {!q.trim() && <p className="muted">Start typing to search this branch.</p>}
            {q.trim() && !busy && rows.length === 0 && !error && <p className="muted">No match.</p>}
            {rows.map((c) => (
              <button key={c.id} type="button" className="picker-row" onClick={() => onPick(c)}>
                <span className="picker-id">{c.custId}</span>
                <span className="picker-name">
                  {c.name}
                  <small className="muted">{[c.city, c.mobile].filter(Boolean).join(' · ') || '—'}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
