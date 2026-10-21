import { useEffect, useState } from 'react'
import { api } from '../api.js'

const MODULE_ROUTE = {
  customer: ['customers'],
  savings: ['soon', 'Savings'],
  fd: ['soon', 'Fixed Deposit'],
  rd: ['soon', 'Recurring Deposit'],
  jewel: ['soon', 'Jewel Loan'],
  loans: ['soon', 'Other Loans'],
  cashbank: ['soon', 'Cash Book Reports'],
  reminders: ['soon', 'Reminders'],
}

export default function Dashboard({ navigate }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/dashboard').then(setData).catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="notice error">{error}</div>
  if (!data) return <div className="muted">Loading…</div>

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  function openModule(key) {
    const [name, title] = MODULE_ROUTE[key] || ['dashboard']
    navigate(name, title ? { title } : {})
  }

  return (
    <div className="dash">
      {/* Hero */}
      <div className="dash-hero">
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Branch overview</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>{today}</p>
        </div>
        <button className="btn primary" onClick={() => navigate('customer-new')}>+ New customer</button>
      </div>

      {/* KPI tiles */}
      <div className="kpi-row">
        {data.kpis.map((k) => (
          <div className="kpi" key={k.key}>
            <div className="kpi-ico">{k.icon}</div>
            <div className="kpi-body">
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value">{k.money ? `₹${fmt(k.value)}` : fmt(k.value)}</div>
              <div className="kpi-hint muted">{k.hint}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Module cards */}
      <div className="module-grid">
        {data.modules.map((m) => (
          <button className={`module-card tone-${m.tone}`} key={m.key} onClick={() => openModule(m.key)}>
            <div className="module-title">{m.title}</div>
            <div className="module-stats">
              {m.stats.map(([label, val]) => (
                <div className="module-stat" key={label}>
                  <span className="ms-label">{label}</span>
                  <span className="ms-val">{val}</span>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>

      {/* Chart + recent */}
      <div className="dash-cols">
        <div className="card">
          <div className="card-head">
            <h3 style={{ margin: 0 }}>New customers</h3>
            <span className="muted" style={{ fontSize: 13 }}>last 6 months</span>
          </div>
          <div className="card-body">
            <BarChart trend={data.trend} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3 style={{ margin: 0 }}>Recent customers</h3>
            <button className="btn ghost" onClick={() => navigate('customers')}>View all</button>
          </div>
          <div className="recent-list">
            {data.recent.length === 0 && <div className="muted" style={{ padding: 18 }}>No customers yet.</div>}
            {data.recent.map((c) => (
              <button className="recent-item" key={c.id} onClick={() => navigate('customer-edit', { id: c.id })}>
                <span className="recent-avatar">{(c.name || '?').slice(0, 1).toUpperCase()}</span>
                <span className="recent-main">
                  <span className="recent-name">{c.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {c.custId}{c.city ? ` · ${c.city}` : ''}
                  </span>
                </span>
                <span className="muted" style={{ fontSize: 12 }}>{new Date(c.createdAt).toLocaleDateString('en-GB')}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function fmt(n) {
  return new Intl.NumberFormat('en-IN').format(n)
}

// Single-series bar chart (inline SVG): indigo bars, rounded tops, per-bar hover.
function BarChart({ trend }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...trend.map((t) => t.count))
  const allZero = trend.every((t) => t.count === 0)

  const W = 520, H = 200, padB = 28, padT = 16, padX = 8
  const plotH = H - padB - padT
  const n = trend.length
  const slot = (W - padX * 2) / n
  const barW = Math.min(44, slot * 0.55)

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" role="img"
        aria-label="New customers per month">
        {/* baseline */}
        <line x1={padX} y1={H - padB} x2={W - padX} y2={H - padB} stroke="var(--border)" strokeWidth="1" />
        {trend.map((t, i) => {
          const h = allZero ? 0 : (t.count / max) * plotH
          const x = padX + slot * i + (slot - barW) / 2
          const y = H - padB - h
          const on = hover === i
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* hover hit area */}
              <rect x={padX + slot * i} y={padT} width={slot} height={H - padB - padT} fill="transparent" />
              {h > 0 && <rect x={x} y={y} width={barW} height={h} rx="4"
                fill={on ? 'var(--primary-hover)' : 'var(--primary)'} />}
              {/* value label */}
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="12" fontWeight="600"
                fill="var(--text)">{t.count || ''}</text>
              {/* month label */}
              <text x={padX + slot * i + slot / 2} y={H - padB + 18} textAnchor="middle" fontSize="12"
                fill="var(--text-muted)">{t.label}</text>
            </g>
          )
        })}
      </svg>
      {allZero && <div className="chart-empty muted">No customers added in the last 6 months yet.</div>}
    </div>
  )
}
