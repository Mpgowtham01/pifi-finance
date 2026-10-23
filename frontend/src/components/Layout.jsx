import { useEffect, useState } from 'react'

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
      { label: 'Share List', soon: 'Share List' },
      { label: 'New Share', soon: 'Share Master' },
      { label: 'Share Transfer', soon: 'Share Transfer' },
      { label: 'Share Reports', soon: 'Share Reports' },
      { label: 'Account Statement', soon: 'Share Account Statement' },
    ],
  },
  {
    key: 'savings', label: 'Savings', ico: '💰',
    children: [
      { label: 'SB Accounts', soon: 'SB Accounts' },
      { label: 'New SB Account', soon: 'Savings Master' },
      { label: 'SB Transaction', soon: 'SB Transaction' },
      { label: 'SB Closure', soon: 'SB Closure' },
      { label: 'SB Product', soon: 'SB Product' },
      { label: 'Account Statement', soon: 'SB Account Statement' },
      { label: 'Outstanding', soon: 'SB Outstanding' },
      { label: 'Savings Reports', soon: 'Savings Reports' },
    ],
  },
  {
    key: 'term', label: 'Term Deposit', ico: '🏦',
    children: [
      { label: 'FD List', soon: 'FD List' },
      { label: 'New FD', soon: 'Fixed Deposit Master' },
      { label: 'Kamadenu Deposit', soon: 'Kamadenu Deposit Master' },
      { label: 'Deposit Loan', soon: 'Deposit Loan Master' },
      { label: 'FD Interest Payment', soon: 'FD Interest Payment' },
      { label: 'FD Maturity', soon: 'FD Maturity' },
      { label: 'FD Renewal', soon: 'FD Renewal' },
      { label: 'FD Closure', soon: 'FD Account Closure' },
      { label: 'FD Reports', soon: 'FD Reports' },
      { label: 'RD List', soon: 'RD List' },
      { label: 'New RD', soon: 'Recurring Deposit' },
      { label: 'RD Receipt', soon: 'RD Receipt' },
      { label: 'RD Standing Instruction', soon: 'RD Standing Instruction' },
      { label: 'RD Pending Installments', soon: 'RD Pending Installments' },
      { label: 'RD Closure', soon: 'RD Account Closure' },
      { label: 'RD Reports', soon: 'RD Reports' },
    ],
  },
  {
    key: 'loan', label: 'Loan', ico: '💍',
    children: [
      { label: 'Jewel Loan List', soon: 'Jewel Loan List' },
      { label: 'New Jewel Loan', soon: 'Jewel Loan Master' },
      { label: 'JL Receipt', soon: 'JL Receipt' },
      { label: 'JL Stock Register', soon: 'JL Stock Register' },
      { label: 'JL OD Report', soon: 'JL OD Report' },
      { label: 'Auction Notification', soon: 'JML Auction Notification' },
      { label: 'Repledge List', soon: 'Repledge List' },
      { label: 'Repledge Closure', soon: 'Repledge Closure' },
      { label: 'Demand Loan List', soon: 'Demand Loan List' },
      { label: 'OL Receipt', soon: 'OL Receipt' },
      { label: 'Loan Reports', soon: 'Loan Reports' },
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
  if (name.startsWith('set-')) return 'settings'
  if (name === 'dashboard') return 'dashboard'
  return null
}

const ALL_TITLES = {
  customers: 'Customer List',
  'customer-new': 'Customer Master',
  'customer-edit': 'Customer Master',
  'customer-enquiry': 'Customer Enquiry',
  'customer-reports': 'Customer Reports',
}
for (const it of MENU) {
  if (it.route) ALL_TITLES[it.route] ??= it.label
  for (const c of it.children || []) if (c.route) ALL_TITLES[c.route] ??= c.label
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

  const title = route.name === 'soon' ? route.params.title : ALL_TITLES[route.name] || 'PiFi'

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
        <div className="brand">
          <span className="logo">Pi</span>
          <span>PiFi Finance</span>
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
            <span className="page-title">{title}</span>
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
