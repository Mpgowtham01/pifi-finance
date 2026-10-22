import { useEffect, useRef, useState } from 'react'
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

const MODULE_ICON = {
  customer: '👤', savings: '💰', fd: '🏦', rd: '🔁',
  jewel: '💍', loans: '📄', cashbank: '🧾', reminders: '🔔',
}

const SLIDE_MS = 5000

export default function Dashboard({ navigate, session }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/dashboard').then(setData).catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="notice error">{error}</div>
  if (!data) return <div className="dash-skeleton" aria-busy="true" />

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  function openModule(key) {
    const [name, title] = MODULE_ROUTE[key] || ['dashboard']
    navigate(name, title ? { title } : {})
  }

  return (
    <div className="dash">
      <section className="dash-hero rise" style={{ '--i': 0 }}>
        <div className="hero-blobs" aria-hidden="true">
          <span />
          <span />
        </div>
        <div className="hero-left">
          {session?.branch && <span className="hero-chip">{session.branch.label}</span>}
          <h2>Branch overview</h2>
          <p>{today}</p>
          <div className="hero-actions">
            <button className="btn primary" onClick={() => navigate('customer-new')}>
              + New customer
            </button>
            <button className="btn hero-ghost" onClick={() => navigate('customers')}>
              Customer list
            </button>
          </div>
        </div>
        <KpiSlider kpis={data.kpis} />
      </section>

      <section className="module-grid">
        {data.modules.map((m, i) => (
          <button
            className={`module-card tone-${m.tone} rise`}
            style={{ '--i': i + 1 }}
            key={m.key}
            onClick={() => openModule(m.key)}
          >
            <div className="module-top">
              <span className="module-ico">{MODULE_ICON[m.key] || '•'}</span>
              <span className="module-title">{m.title}</span>
              <span className="module-go">→</span>
            </div>
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
      </section>

      <section className="dash-cols">
        <div className="card rise" style={{ '--i': 9 }}>
          <div className="card-head">
            <h3 style={{ margin: 0 }}>New customers</h3>
            <span className="muted" style={{ fontSize: 13 }}>last 6 months</span>
          </div>
          <div className="card-body">
            <BarChart trend={data.trend} />
          </div>
        </div>

        <div className="card rise" style={{ '--i': 10 }}>
          <div className="card-head">
            <h3 style={{ margin: 0 }}>Recent customers</h3>
            <button className="btn ghost" onClick={() => navigate('customers')}>
              View all
            </button>
          </div>
          <div className="recent-list">
            {data.recent.length === 0 && <div className="muted" style={{ padding: 18 }}>No customers yet.</div>}
            {data.recent.map((c, i) => (
              <button
                className="recent-item"
                style={{ '--i': i }}
                key={c.id}
                onClick={() => navigate('customer-enquiry', { id: c.id })}
              >
                <span className="recent-avatar">
                  {c.hasPhoto ? (
                    <img src={`/api/customers/${c.id}/photo`} alt="" loading="lazy" />
                  ) : (
                    (c.name || '?').slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="recent-main">
                  <span className="recent-name">{c.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {c.custId}
                    {c.city ? ` · ${c.city}` : ''}
                  </span>
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {new Date(c.createdAt).toLocaleDateString('en-GB')}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------- the slider */

// The branch totals, one at a time, moving on by themselves. Hovering or
// focusing it holds the current slide so a figure can be read.
function KpiSlider({ kpis }) {
  const [at, setAt] = useState(0)
  const [held, setHeld] = useState(false)
  const n = kpis.length

  useEffect(() => {
    if (held || n < 2 || reducedMotion()) return
    const t = setTimeout(() => setAt((i) => (i + 1) % n), SLIDE_MS)
    return () => clearTimeout(t)
  }, [at, held, n])

  const go = (d) => setAt((i) => (i + d + n) % n)

  return (
    <div
      className="kpi-slider"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="kpi-track">
        {kpis.map((k, i) => (
          <article key={k.key} className={`kpi-slide ${slideState(i, at, n)}`} aria-hidden={i !== at}>
            <span className="kpi-slide-ico">{k.icon}</span>
            <span className="kpi-slide-label">{k.label}</span>
            <strong className="kpi-slide-value">
              {k.money && '₹'}
              <CountUp to={k.value} run={i === at} />
            </strong>
            <span className="kpi-slide-hint">{k.hint}</span>
          </article>
        ))}
      </div>

      <div className="kpi-controls">
        <button type="button" className="kpi-arrow" onClick={() => go(-1)} aria-label="Previous figure">
          ‹
        </button>
        <div className="kpi-dots">
          {kpis.map((k, i) => (
            <button
              key={k.key}
              type="button"
              className={`kpi-dot${i === at ? ' on' : ''}`}
              onClick={() => setAt(i)}
              aria-label={k.label}
              aria-current={i === at}
            >
              <span className="kpi-dot-fill" style={{ animationDuration: `${SLIDE_MS}ms` }} />
            </button>
          ))}
        </div>
        <button type="button" className="kpi-arrow" onClick={() => go(1)} aria-label="Next figure">
          ›
        </button>
      </div>
    </div>
  )
}

const slideState = (i, at, n) => (i === at ? 'is-on' : i === (at - 1 + n) % n ? 'is-prev' : 'is-next')

/* ------------------------------------------------------------- the pieces */

// Counts up to the figure once its slide is showing.
function CountUp({ to, run, ms = 900 }) {
  const [v, setV] = useState(run ? to : 0)
  const frame = useRef(0)

  useEffect(() => {
    if (!run) return
    if (reducedMotion()) {
      setV(to)
      return
    }
    let start
    const tick = (t) => {
      start ??= t
      const p = Math.min(1, (t - start) / ms)
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) frame.current = requestAnimationFrame(tick)
    }
    setV(0)
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [to, run, ms])

  return <>{fmt(v)}</>
}

function fmt(n) {
  return new Intl.NumberFormat('en-IN').format(n)
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Single-series bar chart (inline SVG): indigo bars, rounded tops, per-bar
// hover. Each bar grows from the baseline as the card appears.
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
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="New customers per month"
      >
        <line x1={padX} y1={H - padB} x2={W - padX} y2={H - padB} stroke="var(--border)" strokeWidth="1" />
        {trend.map((t, i) => {
          const h = allZero ? 0 : (t.count / max) * plotH
          const x = padX + slot * i + (slot - barW) / 2
          const y = H - padB - h
          const on = hover === i
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padX + slot * i} y={padT} width={slot} height={H - padB - padT} fill="transparent" />
              {h > 0 && (
                <rect
                  className="bar"
                  style={{ '--grow-delay': `${i * 70}ms`, transformOrigin: `center ${H - padB}px` }}
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx="4"
                  fill={on ? 'var(--primary-hover)' : 'var(--primary)'}
                />
              )}
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text)">
                {t.count || ''}
              </text>
              <text
                x={padX + slot * i + slot / 2}
                y={H - padB + 18}
                textAnchor="middle"
                fontSize="12"
                fill="var(--text-muted)"
              >
                {t.label}
              </text>
            </g>
          )
        })}
      </svg>
      {allZero && <div className="chart-empty muted">No customers added in the last 6 months yet.</div>}
    </div>
  )
}
