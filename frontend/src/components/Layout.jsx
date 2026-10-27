import { Fragment, useEffect, useState } from 'react'
import { company } from '../company.js'

// The top menu of the reference app, in its order (from Dashboard.aspx `ul.menu`):
// Settings · Customer · Share · Savings · Term Deposit · Loan · Vouchers · Admin · Dashboard.
// Each parent's children are the links on its *_Home.aspx page. No extra menus.
const MENU = [
  {
    key: 'settings', label: 'Settings', ico: '⚙️',
    // Same nineteen entries, in the same order, as the old Settings_Home.aspx.
    children: [
      { label: 'Branch Master', route: 'set-branch' },
      { label: 'Schedule Master', route: 'set-schedule' },
      { label: 'GL Master', route: 'set-gl' },
      { label: 'GL Opening Balance', route: 'set-opening' },
      { label: 'Scheme Master', route: 'set-scheme' },
      { label: 'Interest Slab', route: 'set-slab' },
      { label: 'General Settings', route: 'set-general' },
      { label: 'List of Bank Accounts', route: 'set-bank-accounts' },
      { label: 'Jewel Description', route: 'set-jewel' },
      { label: 'JL Market Rate', route: 'set-gold-rate' },
      { label: 'Deposit Period Master', route: 'set-deposit-period' },
      { label: 'Id Proof Master', route: 'set-id-proof' },
      { label: 'Bank Master', route: 'set-bank' },
      { label: 'Calendar Settings', route: 'set-calendar' },
      { label: 'Report Settings', route: 'set-report' },
      { label: 'User Registration', route: 'set-users' },
      { label: 'Change Password', route: 'set-password' },
      { label: 'Permission Settings', route: 'set-permissions' },
      { label: 'Interest Provision', route: 'set-provision' },
    ],
  },
  {
    key: 'customer', label: 'Customer', ico: '👤',
    children: [
      { label: 'Customer List', route: 'customers' },
      { label: 'Customer Master', route: 'customer-new' },
      { label: 'Customer Enquiry', route: 'customer-enquiry' },
      { label: "List of A/c's for Customer", route: 'customer-reports' },
    ],
  },
  {
    key: 'share', label: 'Share', ico: '📈',
    children: [
      { label: 'Share Master', route: 'share-list' },
      { label: 'Share Allotment Report', route: 'share-allotment' },
      { label: 'Share Certificate', route: 'share-certificate' },
      { label: 'Share Transfer', route: 'share-transfer' },
      { label: 'Account Statement', route: 'share-statement' },
    ],
  },
  {
    key: 'savings', label: 'Savings', ico: '💰',
    children: [
      { label: 'Savings A/c Master', route: 'sb-list' },
      { label: 'Savings Transaction', route: 'sb-tran' },
      { label: 'Half-yearly Product', route: 'sb-product' },
      { label: 'SD Account Closure', route: 'sb-closure' },
      { label: 'Account Statement', route: 'sb-statement' },
      { label: 'Reports', route: 'sb-reports' },
      { label: 'O/s as on', route: 'sb-os' },
    ],
  },
  {
    key: 'term', label: 'Term Deposit', ico: '🏦',
    children: [
      { label: 'FD Account Master', route: 'fd-list' },
      { label: 'FD Interest Payment', route: 'fd-interest' },
      { label: 'FD Maturity', route: 'fd-maturity' },
      { label: 'FD Account Closure', route: 'fd-closure' },
      { label: 'FD Renewal', route: 'fd-renewal' },
      { label: 'FD Reports', route: 'fd-reports' },
      { label: 'Account Statement', route: 'fd-statement' },
      { label: 'O/s as on', route: 'fd-os' },
    ],
  },
  {
    key: 'loan', label: 'Loan', ico: '💍',
    children: [
      { label: 'Jewel Loan', route: 'jl-list' },
      { label: 'JL Receipt', route: 'jl-receipt' },
      { label: 'JL Stock', route: 'jl-stock' },
      { label: 'JL Reports', route: 'jl-reports' },
      { label: 'JL O/s as on', route: 'jl-os' },
      { label: 'JL OD Status', route: 'jl-od' },
      { label: 'JL Notice', route: 'jl-notice' },
      { label: 'Account Statement', route: 'jl-statement' },
      { label: 'JL Repledge', route: 'jl-repledge' },
      { label: 'JL Repledge Closure', route: 'jl-repledge-close' },
      { label: 'New Jewel Loan', route: 'jl-new' },
    ],
  },
  {
    key: 'vouchers', label: 'Vouchers', ico: '🧾',
    children: [
      { label: 'Journal', soon: 'Journal Voucher' },
      { label: 'Payment Voucher', soon: 'Payment Voucher' },
      { label: 'Receipt Voucher', soon: 'Receipt Voucher' },
    ],
  },
  {
    key: 'admin', label: 'Admin', ico: '🏛️',
    children: [
      { label: 'View Transactions', soon: 'View Transactions' },
      { label: 'Cash Book Reports', soon: 'Cash Book Reports' },
      { label: 'Reminders', soon: 'Reminders' },
      { label: 'SMS Reminder', soon: 'SMS Reminder' },
      { label: 'Circulars', soon: 'Circulars' },
      { label: 'Messages', soon: 'Messages' },
    ],
  },
  { key: 'dashboard', label: 'Dashboard', ico: '▦', route: 'dashboard' },
]

// Which top-level module the current screen belongs to, so the sidebar can
// show that group open and mark it. A coming-soon screen carries the name of
// the module it came from.
function ownerOf(route) {
  const { name, params } = route
  if (name === 'soon' && params?.parent) return MENU.find((m) => m.label === params.parent)?.key || null
  if (name.startsWith('customer')) return 'customer'
  if (name.startsWith('jl-')) return 'loan'
  if (name.startsWith('share-')) return 'share'
  if (name.startsWith('sb-')) return 'savings'
  if (name.startsWith('fd-')) return 'term'
  if (name.startsWith('set-')) return 'settings'
  if (name === 'dashboard') return 'dashboard'
  return null
}

// Which screen each one is reached through. Anything not named here sits
// directly under its module.
const OPENED_FROM = {
  'customer-new': 'customers',
  'customer-edit': 'customers',
  'customer-enquiry': 'customers',
  'customer-reports': 'customers',
  'jl-new': 'jl-list',
  'jl-edit': 'jl-list',
  'jl-view': 'jl-list',
  'jl-receipt': 'jl-list',
  'share-new': 'share-list',
  'share-edit': 'share-list',
  'share-view': 'share-list',
  'sb-new': 'sb-list',
  'sb-edit': 'sb-list',
  'sb-view': 'sb-list',
  'fd-new': 'fd-list',
  'fd-edit': 'fd-list',
  'fd-view': 'fd-list',
}

const ALL_TITLES = {
  customers: 'Customer List',
  'customer-new': 'Customer Master',
  'customer-edit': 'Customer Master',
  'customer-enquiry': 'Customer Enquiry',
  'customer-reports': 'Customer Reports',
  'fd-new': 'Fixed Deposit Master',
  'fd-edit': 'Fixed Deposit Master',
  'fd-view': 'Fixed Deposit',
  'sb-new': 'Savings A/c Master',
  'sb-edit': 'Savings A/c Master',
  'sb-view': 'Savings Account',
  'share-new': 'Share Master',
  'share-edit': 'Share Master',
  'share-view': 'Share Holding',
  'jl-new': 'Jewel Loan Master',
  'jl-edit': 'Jewel Loan Master',
  'jl-view': 'Jewel Loan',
  'jl-repledge-close': 'JL Repledge Closure',
  'jl-statement': 'Account Statement',
  'jl-reports': 'JL Reports',
  'jl-os': 'JL O/s as on',
}
for (const it of MENU) {
  if (it.route) ALL_TITLES[it.route] ??= it.label
  for (const c of it.children || []) if (c.route) ALL_TITLES[c.route] ??= c.label
}

// The trail to the current screen: its module, whatever it was opened
// through, and itself. Only the last crumb is the page you are on.
function crumbsFor(route) {
  const titleOf = (name, params) =>
    name === 'soon' ? params?.title || 'Soon' : ALL_TITLES[name] || name

  const trail = []
  const owner = ownerOf(route)
  const module = MENU.find((m) => m.key === owner)
  // A module is a section of the app, not a screen. Only the few that have a
  // page of their own — Dashboard — are somewhere to go back to.
  if (module) trail.push({ label: module.label, route: module.route || null })

  // Walk back up the chain of screens this one was opened through.
  const chain = []
  const guard = new Set([route.name])
  let cur = route.name
  while (OPENED_FROM[cur] && !guard.has(OPENED_FROM[cur])) {
    cur = OPENED_FROM[cur]
    guard.add(cur)
    chain.unshift({ label: titleOf(cur), route: cur })
  }
  trail.push(...chain)

  // The page itself, named by its record where the address carries one.
  const own = titleOf(route.name, route.params)
  trail.push({ label: route.params?.accNo ? `${own} · ${route.params.accNo}` : own, route: null })

  // A module whose landing page is this very screen would say the same thing
  // twice.
  return trail.filter((c, i) => i === 0 || c.label !== trail[i - 1].label)
}

// matchMedia is missing outside a browser; default to the wide layout there.
const matches = (q) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false)

export default function Layout({ session, route, navigate, onLogout, onSwitchBranch, children }) {
  const [open, setOpen] = useState(false) // the drawer, on a narrow screen
  // Collapsed to an icon rail on a wide screen. Remembered between visits.
  const [rail, setRail] = useState(() => {
    try {
      return localStorage.getItem('pifi.rail') === '1'
    } catch {
      return false
    }
  })
  const owner = ownerOf(route)
  // One group at a time, the way the old accordion menu behaved.
  const [openGroup, setOpenGroup] = useState(owner || 'customer')
  const { user, branch, branches } = session

  useEffect(() => {
    try {
      localStorage.setItem('pifi.rail', rail ? '1' : '0')
    } catch {
      /* private window — the rail just will not be remembered */
    }
  }, [rail])

  // The toggle does two jobs, so it has to know which screen it is on.
  const [narrow, setNarrow] = useState(() => matches('(max-width: 820px)'))
  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 820px)')
    if (!mq) return
    const on = (e) => setNarrow(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // The same button slides the drawer on a phone and collapses the rail on a desktop.
  const toggleSidebar = () => (narrow ? setOpen((o) => !o) : setRail((r) => !r))
  // The arrow points the way the menu will go: left to tuck away, right to bring back.
  const willClose = narrow ? open : !rail

  const crumbs = crumbsFor(route)

  // Moving to a screen in another module opens that module's group.
  useEffect(() => {
    if (owner) setOpenGroup(owner)
  }, [owner])

  // Escape closes the drawer, and the page behind it does not scroll.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  function toggle(key) {
    if (rail) {
      setRail(false)
      setOpenGroup(key)
      return
    }
    setOpenGroup((k) => (k === key ? null : key))
  }

  function go(leaf, parent) {
    setOpen(false)
    if (leaf.route) navigate(leaf.route)
    else navigate('soon', { title: leaf.soon, parent: parent?.label, ico: parent?.ico })
  }

  return (
    <div className="app">
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside className={`sidebar${open ? ' open' : ''}${rail ? ' rail' : ''}`}>
        <div className="brand" title={company.name}>
          <img className="logo" src={company.logo} alt="" />
          <span>{company.name}</span>
        </div>
        <nav className="nav">
          {MENU.map((it) => {
            if (!it.children) {
              return (
                <button
                  key={it.key}
                  className={route.name === it.route ? 'active' : ''}
                  onClick={() => go(it)}
                  title={it.label}
                >
                  <span className="ico">{it.ico}</span>
                  <span>{it.label}</span>
                </button>
              )
            }
            const isOpen = openGroup === it.key
            const isOwner = owner === it.key
            return (
              <div key={it.key}>
                <button
                  className={`parent ${isOwner ? 'owner' : ''}`}
                  onClick={() => toggle(it.key)}
                  aria-expanded={isOpen}
                  title={it.label}
                >
                  <span className="ico">{it.ico}</span>
                  <span style={{ flex: 1 }}>{it.label}</span>
                  <span className={`chev ${isOpen ? 'open' : ''}`}>›</span>
                </button>
                {isOpen && (
                  <div className="submenu">
                    {it.children.map((c) => (
                      <button
                        key={c.label}
                        className={`child ${c.route && route.name === c.route ? 'active' : ''}`}
                        onClick={() => go(c, it)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className={`nav-toggle${willClose ? '' : ' flipped'}`}
              onClick={toggleSidebar}
              title={willClose ? 'Hide the menu' : 'Show the menu'}
              aria-label={willClose ? 'Hide the menu' : 'Show the menu'}
              aria-expanded={willClose}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M14.5 6.5 9 12l5.5 5.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <nav className="crumbs" aria-label="Breadcrumb">
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1
                return (
                  <Fragment key={`${c.label}-${i}`}>
                    {i > 0 && (
                      <span className="crumb-sep" aria-hidden="true">
                        ›
                      </span>
                    )}
                    {c.route && !last && c.route !== route.name ? (
                      <button type="button" className="crumb" onClick={() => navigate(c.route)}>
                        {c.label}
                      </button>
                    ) : (
                      <span className={`crumb${last ? ' current' : ''}`} aria-current={last ? 'page' : undefined}>
                        {c.label}
                      </span>
                    )}
                  </Fragment>
                )
              })}
            </nav>
          </div>
          <div className="right">
            <div className="branch-switch">
              <select value={branch?.id || ''} onChange={(e) => onSwitchBranch(e.target.value)}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="user-chip">
              <span className="avatar">{(user.name || user.username).slice(0, 1).toUpperCase()}</span>
              <div>
                <div style={{ fontWeight: 600 }}>{user.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {user.role}
                </div>
              </div>
            </div>
            <button className="btn ghost" onClick={onLogout}>
              Logout
            </button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
