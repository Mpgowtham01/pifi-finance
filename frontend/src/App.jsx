import { useEffect, useState, useCallback } from 'react'
import { api } from './api.js'
import Login from './components/Login.jsx'
import Layout from './components/Layout.jsx'
import Dashboard from './components/Dashboard.jsx'
import CustomerList from './components/CustomerList.jsx'
import CustomerForm from './components/CustomerForm.jsx'
import CustomerEnquiry from './components/CustomerEnquiry.jsx'
import CustomerReports from './components/CustomerReports.jsx'
import ComingSoon from './components/ComingSoon.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import {
  ScheduleMaster, GlMaster, SchemeMaster, InterestSlabMaster, JewelDescription,
  IdProofMaster, BankMaster, MarketRate, DepositPeriodMaster, ReportSettings,
} from './components/settings/masters.jsx'
import {
  BranchMaster, GeneralSettings, OpeningBalances, CalendarSettings,
  UserRegistration, ChangePassword, PermissionSettings, InterestProvision,
} from './components/settings/screens.jsx'
import BankAccounts from './components/settings/BankAccounts.jsx'

// The Settings menu, keyed by route. Order lives in Layout's menu.
const SETTINGS_SCREENS = {
  'set-branch': BranchMaster,
  'set-schedule': ScheduleMaster,
  'set-gl': GlMaster,
  'set-opening': OpeningBalances,
  'set-scheme': SchemeMaster,
  'set-slab': InterestSlabMaster,
  'set-general': GeneralSettings,
  'set-bank-accounts': BankAccounts,
  'set-jewel': JewelDescription,
  'set-gold-rate': MarketRate,
  'set-deposit-period': DepositPeriodMaster,
  'set-id-proof': IdProofMaster,
  'set-bank': BankMaster,
  'set-calendar': CalendarSettings,
  'set-report': ReportSettings,
  'set-users': UserRegistration,
  'set-password': ChangePassword,
  'set-permissions': PermissionSettings,
  'set-provision': InterestProvision,
}

export default function App() {
  const [session, setSession] = useState(null) // { user, branch, branches }
  const [loading, setLoading] = useState(true)
  // Simple state router: { name, params }
  const [route, setRoute] = useState({ name: 'dashboard', params: {} })

  const loadSession = useCallback(async () => {
    try {
      const me = await api.get('/auth/me')
      setSession(me)
    } catch {
      setSession(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  const navigate = (name, params = {}) => setRoute({ name, params })

  async function logout() {
    await api.post('/auth/logout')
    setSession(null)
    setRoute({ name: 'dashboard', params: {} })
  }

  async function switchBranch(branchId) {
    const { branch } = await api.post('/auth/switch-branch', { branch: branchId })
    setSession((s) => ({ ...s, branch }))
    setRoute({ name: 'dashboard', params: {} }) // data is branch-scoped, so reset
  }

  if (loading) return <div className="login-wrap" />
  if (!session) return <Login onDone={loadSession} />

  function renderPage() {
    const SettingsScreen = SETTINGS_SCREENS[route.name]
    if (SettingsScreen) return <SettingsScreen key={route.name} session={session} navigate={navigate} />

    switch (route.name) {
      case 'customers':
        return <CustomerList navigate={navigate} />
      case 'customer-new':
        return <CustomerForm key="new" navigate={navigate} />
      case 'customer-edit':
        return <CustomerForm key={route.params.id} navigate={navigate} id={route.params.id} />
      case 'customer-enquiry':
        return <CustomerEnquiry key={route.params.id || 'none'} navigate={navigate} id={route.params.id} />
      case 'customer-reports':
        return <CustomerReports navigate={navigate} custId={route.params.custId} />
      case 'soon':
        return (
          <ComingSoon
            key={route.params.title}
            navigate={navigate}
            title={route.params.title}
            parent={route.params.parent}
            ico={route.params.ico}
          />
        )
      default:
        return <Dashboard navigate={navigate} session={session} />
    }
  }

  return (
    <Layout
      session={session}
      route={route}
      navigate={navigate}
      onLogout={logout}
      onSwitchBranch={switchBranch}
    >
      <ErrorBoundary resetKey={route.name}>{renderPage()}</ErrorBoundary>
    </Layout>
  )
}
