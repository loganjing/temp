import { useCallback, useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { apiRequest } from './platform/api-client'
import LoginPage from './pages/LoginPage'
import WorkbenchPage from './pages/WorkbenchPage'
import TicketDetailPage from './pages/TicketDetailPage'
import StatsPage from './pages/StatsPage'
import AdminPage from './pages/AdminPage'
import { ToastProvider } from './components/Toast'
import type { CurrentUser } from './types'

const NAV_ITEMS = [
  { to: '/workbench', label: '工单工作台', icon: '📋', roles: ['submitter', 'handler', 'admin'] },
  { to: '/tickets', label: '工单详情', icon: '🎫', roles: ['submitter', 'handler', 'admin'] },
  { to: '/stats', label: '统计分析', icon: '📊', roles: ['admin'] },
  { to: '/admin', label: '管理配置', icon: '⚙️', roles: ['admin'] },
]

export default function App() {
  const [state, setState] = useState<'checking' | 'login' | 'authenticated'>('checking')
  const [user, setUser] = useState<CurrentUser | null>(null)

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('platform-token')
    if (token) {
      try {
        const me = await apiRequest<CurrentUser>('/api/auth/me')
        setUser(me)
        setState('authenticated')
        return
      } catch {
        localStorage.removeItem('platform-token')
      }
    }
    setState('login')
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const handleAuthed = (authedUser: CurrentUser) => {
    setUser(authedUser)
    setState('authenticated')
  }

  const logout = () => {
    localStorage.removeItem('platform-token')
    setUser(null)
    setState('login')
  }

  if (state === 'checking') return <main className="auth-shell"><p>加载中…</p></main>
  if (state === 'login' || !user) return <LoginPage onAuthed={handleAuthed} />
  if (user.passwordChangeRequired) return <LoginPage onAuthed={handleAuthed} />

  const roles = user.roles
  const visibleNav = NAV_ITEMS.filter((item) => item.roles.some((r) => roles.includes(r)))

  return (
    <ToastProvider>
      <div className="app-shell">
        <nav className="sidebar">
          <div className="sidebar-brand">工单系统</div>
          <div className="sidebar-nav">
            {visibleNav.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <span>{item.icon}</span> {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
        <div className="main-area">
          <header className="topbar">
            <div></div>
            <div className="topbar-user">
              <div className="user-info">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
              <button className="secondary" onClick={logout}>退出</button>
            </div>
          </header>
          <main className="content-area">
            <Routes>
              <Route path="/" element={<WorkbenchPage roles={roles} />} />
              <Route path="/workbench" element={<WorkbenchPage roles={roles} />} />
              <Route path="/tickets" element={<WorkbenchPage roles={roles} />} />
              <Route path="/tickets/:id" element={<TicketDetailPage roles={roles} />} />
              {roles.includes('admin') && <Route path="/stats" element={<StatsPage />} />}
              {roles.includes('admin') && <Route path="/admin" element={<AdminPage />} />}
              <Route path="*" element={<WorkbenchPage roles={roles} />} />
            </Routes>
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
