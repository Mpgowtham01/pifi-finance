// Shown for every menu entry whose screen is not built yet.
export default function ComingSoon({ navigate, title, parent }) {
  return (
    <div className="soon">
      <div className="soon-card">
        <Illustration />
        <span className="soon-eyebrow">Coming soon</span>
        <h2>{title}</h2>
        <p>
          This screen is not built yet
          {parent ? (
            <>
              {' '}
              — it arrives with the <strong>{parent}</strong> module.
            </>
          ) : (
            '.'
          )}
        </p>
        <button className="btn primary" onClick={() => navigate('dashboard')}>
          Back to Dashboard
        </button>
      </div>
    </div>
  )
}

// A screen still on the drawing board: a finished panel behind, an outlined one
// in front with its content sketched in.
function Illustration() {
  return (
    <svg className="soon-art" viewBox="0 0 200 132" role="img" aria-label="Screen not built yet">
      <defs>
        <linearGradient id="soonSheet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary-soft)" />
          <stop offset="100%" stopColor="var(--surface)" />
        </linearGradient>
      </defs>

      {/* the panel already in place, sitting behind */}
      <rect x="30" y="8" width="140" height="92" rx="10" fill="url(#soonSheet)" stroke="var(--border)" />
      <rect x="42" y="22" width="52" height="6" rx="3" fill="var(--primary)" opacity="0.35" />
      <rect x="42" y="36" width="116" height="5" rx="2.5" fill="var(--border)" />
      <rect x="42" y="48" width="96" height="5" rx="2.5" fill="var(--border)" />

      {/* the one being drawn, in front */}
      <rect
        x="16"
        y="40"
        width="134"
        height="80"
        rx="10"
        fill="var(--surface)"
        stroke="var(--primary)"
        strokeOpacity="0.55"
        strokeDasharray="6 5"
      />
      <rect x="30" y="56" width="44" height="7" rx="3.5" fill="var(--primary)" opacity="0.8" />
      <rect x="30" y="74" width="106" height="6" rx="3" fill="var(--primary)" opacity="0.18" />
      <rect x="30" y="88" width="78" height="6" rx="3" fill="var(--primary)" opacity="0.18" />
      <rect x="30" y="102" width="54" height="6" rx="3" fill="var(--primary)" opacity="0.18" />

      {/* a small marker, to say work in progress */}
      <circle cx="163" cy="103" r="18" fill="var(--primary)" />
      <path
        d="M163 95.5v15M155.5 103h15"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  )
}
