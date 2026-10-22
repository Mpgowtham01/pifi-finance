import { useState } from 'react'

// EXACT top menu of the reference PiFi app (from Dashboard.aspx `ul.menu`):
// Dashboard · Customer · Share · Savings · Term Deposit · Loan · Vouchers · Admin · Settings.
// Each parent's children are the links on its *_Home.aspx page. No extra menus.
const MENU = [
  { key: 'dashboard', label: 'Dashboard', ico: '▦', route: 'dashboard' },
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
  {
    key: 'settings', label: 'Settings', ico: '⚙️',
    children: [
      { label: 'User Registration', soon: 'User Registration' },
      { label: 'Permission Set', soon: 'Permission Set' },
      { label: 'Change Password', soon: 'Change Password' },
      { label: 'Branch Master', soon: 'Branch Master' },
      { label: 'General Settings', soon: 'General Settings' },
      { label: 'Report Settings', soon: 'Report Settings' },
      { label: 'GL Master', soon: 'GL Master' },
      { label: 'Scheme List', soon: 'Scheme List' },
      { label: 'Interest Rate', soon: 'Interest Rate' },
      { label: 'Deposit Period Master', soon: 'Deposit Period Master' },
      { label: 'Interest Provisioning', soon: 'Interest Provisioning' },
      { label: 'Jewel Master', soon: 'Jewel Master' },
      { label: 'JL Market Rate', soon: 'JL Market Rate' },
      { label: 'Bank Accounts', soon: 'Bank Accounts' },
      { label: 'NEFT Banks', soon: 'NEFT Banks' },
      { label: 'List of ID Proofs', soon: 'List of ID Proofs' },
      { label: 'Opening Balance', soon: 'Opening Balance' },
      { label: 'Schedule Master', soon: 'Schedule Master' },
      { label: 'Calendar', soon: 'Calendar' },
    ],
  },
]

function ownerOf(routeName) {
  if (routeName.startsWith('customer')) return 'customer'
  if (routeName === 'dashboard') return 'dashboard'
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

export default function Layout({ session, route, navigate, onLogout, onSwitchBranch, children }) {
  const [open, setOpen] = useState(false) // mobile drawer
  const owner = ownerOf(route.name)
  const [expanded, setExpanded] = useState(() => new Set(owner ? [owner] : ['customer']))
  const { user, branch, branches } = session

  const title = route.name === 'soon' ? route.params.title : ALL_TITLES[route.name] || 'PiFi'

  function toggle(key) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function go(leaf) {
    setOpen(false)
    if (leaf.route) navigate(leaf.route)
    else navigate('soon', { title: leaf.soon })
  }

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
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
                >
                  <span className="ico">{it.ico}</span>
                  <span>{it.label}</span>
                </button>
              )
            }
            const isOpen = expanded.has(it.key)
            const isOwner = owner === it.key
            return (
              <div key={it.key}>
                <button className={`parent ${isOwner ? 'owner' : ''}`} onClick={() => toggle(it.key)}>
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
                        onClick={() => go(c)}
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
            <button className="btn ghost hamburger" onClick={() => setOpen((o) => !o)}>
              ☰
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
