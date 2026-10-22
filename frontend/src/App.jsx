import { useEffect, useState, useCallback } from 'react'
import { api } from './api.js'
import Login from './components/Login.jsx'
import Layout from './components/Layout.jsx'
import Dashboard from './components/Dashboard.jsx'
import CustomerList from './components/CustomerList.jsx'
import CustomerForm from './components/CustomerForm.jsx'
import CustomerEnquiry from './components/CustomerEnquiry.jsx'
import CustomerReports from './components/CustomerReports.jsx'

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

  let page
  switch (route.name) {
    case 'customers':
      page = <CustomerList navigate={navigate} />
      break
    case 'customer-new':
      page = <CustomerForm key="new" navigate={navigate} />
      break
    case 'customer-edit':
      page = <CustomerForm key={route.params.id} navigate={navigate} id={route.params.id} />
      break
    case 'customer-enquiry':
      page = <CustomerEnquiry key={route.params.id || 'none'} navigate={navigate} id={route.params.id} />
      break
    case 'customer-reports':
      page = <CustomerReports navigate={navigate} custId={route.params.custId} />
      break
    case 'soon':
      page = (
        <div className="card">
          <div className="card-body">
            <h3>{route.params.title}</h3>
            <p className="muted" style={{ margin: 0 }}>
              This module is part of the planned build (see reference-pifi/ANALYSIS.md). Not built yet.
            </p>
          </div>
        </div>
      )
      break
    case 'dashboard':
    default:
      page = <Dashboard navigate={navigate} />
  }

  return (
    <Layout
      session={session}
      route={route}
      navigate={navigate}
      onLogout={logout}
      onSwitchBranch={switchBranch}
    >
      {page}
    </Layout>
  )
}
