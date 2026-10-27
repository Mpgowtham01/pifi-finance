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
import JewelLoanList from './components/loans/JewelLoanList.jsx'
import JewelLoanForm from './components/loans/JewelLoanForm.jsx'
import JewelLoanView from './components/loans/JewelLoanView.jsx'
import JlReceipt from './components/loans/JlReceipt.jsx'
import {
  JlStockRegister, JlOdReport, JlAuctionNotice, JlOutstanding,
} from './components/loans/LoanReports.jsx'
import JlStatement from './components/loans/JlStatement.jsx'
import JlLoanReports from './components/loans/JlLoanReports.jsx'
import { RepledgeList, RepledgeClosure } from './components/loans/Repledge.jsx'
import SavingsList from './components/savings/SavingsList.jsx'
import SavingsForm from './components/savings/SavingsForm.jsx'
import {
  SavingsView, SavingsTransactionScreen, SavingsClosure,
} from './components/savings/SavingsScreens.jsx'
import {
  SavingsProduct, SavingsStatement, SavingsReportsScreen, SavingsOutstanding,
} from './components/savings/SavingsReports.jsx'
import ShareList from './components/shares/ShareList.jsx'
import ShareForm from './components/shares/ShareForm.jsx'
import ShareTransferScreen from './components/shares/ShareTransfer.jsx'
import {
  ShareView, ShareCertificate, ShareAllotmentReport, ShareStatement,
} from './components/shares/ShareScreens.jsx'
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

// The screen and its parameters, as an address. Keeping them in the URL is
// what makes Back, Forward, reload and a pasted link all work.
function routeToUrl({ name, params }) {
  const qs = new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString()
  return `/${name}${qs ? `?${qs}` : ''}`
}

function routeFromUrl() {
  const name = window.location.pathname.replace(/^\/+/, '').split('/')[0] || 'dashboard'
  return { name, params: Object.fromEntries(new URLSearchParams(window.location.search)) }
}

export default function App() {
  const [session, setSession] = useState(null) // { user, branch, branches }
  const [loading, setLoading] = useState(true)
  // The router: { name, params }, mirrored into the browser's history.
  const [route, setRoute] = useState(routeFromUrl)

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

  // Back and Forward hand us the screen we were on. The first entry gets a
  // state of its own too, or going back to it would arrive with nothing.
  useEffect(() => {
    const onPop = (e) => setRoute(e.state?.route || routeFromUrl())
    window.history.replaceState({ route: routeFromUrl() }, '', window.location.href)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = (name, params = {}) => {
    const next = { name, params }
    setRoute(next)
    window.history.pushState({ route: next }, '', routeToUrl(next))
  }

  // Replaces the current entry instead of adding one — for a move the user
  // did not ask for, which they should not have to press Back through.
  const replace = (name, params = {}) => {
    const next = { name, params }
    setRoute(next)
    window.history.replaceState({ route: next }, '', routeToUrl(next))
  }

  async function logout() {
    await api.post('/auth/logout')
    setSession(null)
    replace('dashboard')
  }

  async function switchBranch(branchId) {
    const { branch } = await api.post('/auth/switch-branch', { branch: branchId })
    setSession((s) => ({ ...s, branch }))
    replace('dashboard') // data is branch-scoped, so reset
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

      case 'jl-list':
        return <JewelLoanList navigate={navigate} />
      case 'jl-new':
        return <JewelLoanForm key="new" navigate={navigate} />
      case 'jl-edit':
        return <JewelLoanForm key={route.params.id} navigate={navigate} id={route.params.id} />
      case 'jl-view':
        return <JewelLoanView key={route.params.id} navigate={navigate} id={route.params.id} session={session} />
      case 'jl-receipt':
        return <JlReceipt key={route.params.accNo || 'blank'} navigate={navigate} accNo={route.params.accNo} />
      case 'jl-stock':
        return <JlStockRegister navigate={navigate} />
      case 'jl-reports':
        return <JlLoanReports navigate={navigate} />
      case 'jl-os':
        return <JlOutstanding navigate={navigate} />
      case 'jl-statement':
        return <JlStatement key={route.params.accNo || 'blank'} navigate={navigate} accNo={route.params.accNo} />
      case 'jl-od':
        return <JlOdReport navigate={navigate} />
      case 'jl-notice':
        return <JlAuctionNotice navigate={navigate} />
      case 'sb-list':
        return <SavingsList navigate={navigate} />
      case 'sb-new':
        return <SavingsForm key="new" navigate={navigate} />
      case 'sb-edit':
        return <SavingsForm key={route.params.id} navigate={navigate} id={route.params.id} />
      case 'sb-view':
        return <SavingsView key={route.params.id} navigate={navigate} id={route.params.id} session={session} />
      case 'sb-tran':
        return (
          <SavingsTransactionScreen
            key={route.params.accNo || 'blank'}
            navigate={navigate}
            accNo={route.params.accNo}
          />
        )
      case 'sb-closure':
        return <SavingsClosure key={route.params.accNo || 'blank'} navigate={navigate} accNo={route.params.accNo} />
      case 'sb-product':
        return <SavingsProduct navigate={navigate} session={session} />
      case 'sb-statement':
        return <SavingsStatement key={route.params.accNo || 'blank'} navigate={navigate} accNo={route.params.accNo} />
      case 'sb-reports':
        return <SavingsReportsScreen navigate={navigate} />
      case 'sb-os':
        return <SavingsOutstanding navigate={navigate} />

      case 'share-list':
        return <ShareList navigate={navigate} />
      case 'share-new':
        return <ShareForm key="new" navigate={navigate} />
      case 'share-edit':
        return <ShareForm key={route.params.id} navigate={navigate} id={route.params.id} />
      case 'share-view':
        return <ShareView key={route.params.id} navigate={navigate} id={route.params.id} session={session} />
      case 'share-transfer':
        return (
          <ShareTransferScreen
            key={route.params.accNo || 'blank'}
            navigate={navigate}
            accNo={route.params.accNo}
          />
        )
      case 'share-certificate':
        return <ShareCertificate key={route.params.accNo || 'blank'} navigate={navigate} accNo={route.params.accNo} />
      case 'share-allotment':
        return <ShareAllotmentReport navigate={navigate} />
      case 'share-statement':
        return <ShareStatement key={route.params.accNo || 'blank'} navigate={navigate} accNo={route.params.accNo} />

      case 'jl-repledge':
        return <RepledgeList navigate={navigate} session={session} />
      case 'jl-repledge-close':
        return (
          <RepledgeClosure
            key={route.params.id || route.params.accNo || 'blank'}
            navigate={navigate}
            id={route.params.id}
            accNo={route.params.accNo}
          />
        )
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
