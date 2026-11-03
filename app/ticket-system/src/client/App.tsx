import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { apiRequest } from './platform/api-client'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { WorkbenchPage } from './pages/WorkbenchPage'
import { CreateTicketPage } from './pages/CreateTicketPage'
import { TicketDetailPage } from './pages/TicketDetailPage'
import { BusinessGroupsPage } from './pages/BusinessGroupsPage'
import { RoutingRulesPage } from './pages/RoutingRulesPage'
import { StatisticsPage } from './pages/StatisticsPage'
import type { CurrentUser } from './types'

export default function App() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [authState, setAuthState] = useState<'checking' | 'anonymous' | 'authenticated'>('checking')

  const refreshUser = async () => {
    const token = localStorage.getItem('platform-token')
    if (!token) {
      setAuthState('anonymous')
      return
    }
    try {
      const me = await apiRequest<CurrentUser>('/api/auth/me')
      setUser(me)
      setAuthState('authenticated')
    } catch {
      localStorage.removeItem('platform-token')
      setAuthState('anonymous')
    }
  }

  useEffect(() => { void refreshUser() }, [])

  if (authState === 'checking') {
    return <main className="shell auth-shell"><p className="muted">加载中…</p></main>
  }

  if (authState === 'anonymous' || !user) {
    return <LoginPage onLogin={() => void refreshUser()} />
  }

  return (
    <Layout user={user}>
      <Routes>
        <Route path="/" element={<WorkbenchPage />} />
        <Route path="/tickets/new" element={<CreateTicketPage />} />
        <Route path="/tickets/:id" element={<TicketDetailPage user={user} />} />
        <Route path="/admin/groups" element={user.role === 'admin' ? <BusinessGroupsPage /> : <ForbiddenView />} />
        <Route path="/admin/routing-rules" element={user.role === 'admin' ? <RoutingRulesPage /> : <ForbiddenView />} />
        <Route path="/statistics" element={<StatisticsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

function ForbiddenView() {
  return (
    <div className="page-container">
      <div className="card">
        <h1>无权限</h1>
        <p className="muted">您没有权限访问此页面。</p>
      </div>
    </div>
  )
}
