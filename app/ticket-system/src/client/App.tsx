import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiRequest, ApiRequestError } from './platform/api-client'
import { authApi } from './platform/ticket-api'
import type { CurrentUser, Role } from './types'
import { RoleLabel } from './components'
import {
  DashboardIcon, TicketIcon, ChartIcon, SettingsIcon, LogoutIcon,
} from './icons'
import WorkbenchPage from './pages/WorkbenchPage'
import TicketManagementPage from './pages/TicketManagementPage'
import StatisticsPage from './pages/StatisticsPage'
import AdminPage from './pages/AdminPage'

type AuthState = 'checking' | 'bootstrap' | 'login' | 'password-change' | 'authenticated'
type Page = 'workbench' | 'tickets' | 'statistics' | 'admin'

interface NavItem {
  key: Page
  label: string
  icon: React.ReactNode
  roles: Role[]
}

const navItems: NavItem[] = [
  { key: 'workbench', label: '工单工作台', icon: <DashboardIcon size={20} />, roles: ['submitter', 'handler', 'admin'] },
  { key: 'tickets', label: '工单管理', icon: <TicketIcon size={20} />, roles: ['submitter', 'handler', 'admin'] },
  { key: 'statistics', label: '统计分析', icon: <ChartIcon size={20} />, roles: ['handler', 'admin'] },
  { key: 'admin', label: '管理后台', icon: <SettingsIcon size={20} />, roles: ['admin'] },
]

export default function App() {
  const [authState, setAuthState] = useState<AuthState>('checking')
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState<Page>('workbench')

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('platform-token')
    if (token) {
      try {
        const me = await authApi.me()
        setUser(me)
        setAuthState('authenticated')
        return
      } catch (cause) {
        if (cause instanceof ApiRequestError && cause.status !== 401) {
          setError('无法连接服务')
          setAuthState('checking')
          return
        }
        localStorage.removeItem('platform-token')
      }
    }
    try {
      const status = await apiRequest<{ required: boolean }>('/api/auth/bootstrap-status')
      setAuthState(status.required ? 'bootstrap' : 'login')
    } catch {
      setAuthState('login')
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  // ── Bootstrap（首次账户创建）──
  const handleBootstrap = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const body = Object.fromEntries(new FormData(e.currentTarget).entries())
    try {
      await apiRequest('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(body) })
      setAuthState('login')
      setError('账户已创建，请登录')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建账户失败')
    } finally {
      setBusy(false)
    }
  }

  // ── 登录 ──
  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const form = e.currentTarget
    const username = String(Object.fromEntries(new FormData(form).entries()).username ?? '')
    const password = String(Object.fromEntries(new FormData(form).entries()).password ?? '')
    try {
      const result = await authApi.login(username, password)
      localStorage.setItem('platform-token', result.token)
      if (result.user.passwordChangeRequired) {
        setUser({ ...result.user, email: '', departmentId: null } as CurrentUser)
        setAuthState('password-change')
      } else {
        // 获取完整用户信息
        try {
          const me = await authApi.me()
          setUser(me)
          setAuthState('authenticated')
        } catch {
          // me 失败时使用 login 返回的信息
          setUser({ ...result.user, email: '', departmentId: null } as CurrentUser)
          setAuthState('authenticated')
        }
      }
      form.reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  // ── 修改密码 ──
  const handleChangePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const body = Object.fromEntries(new FormData(e.currentTarget).entries())
    try {
      await apiRequest('/api/auth/password', { method: 'POST', body: JSON.stringify(body) })
      // 重新获取用户信息
      try {
        const me = await authApi.me()
        setUser(me)
      } catch {
        // ignore
      }
      setAuthState('authenticated')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新密码失败')
    } finally {
      setBusy(false)
    }
  }

  // ── 退出 ──
  const handleLogout = async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    localStorage.removeItem('platform-token')
    setUser(null)
    setAuthState('login')
    setPage('workbench')
  }

  // ── 认证界面 ──
  if (authState === 'checking') return <main className="shell"><p className="subtext">加载中…</p></main>

  if (authState === 'bootstrap') return (
    <main className="shell auth-shell">
      <section className="card auth-card">
        <h1>创建首个账户</h1>
        <p className="subtext">仅在系统无用户时可执行一次</p>
        <form className="stack" onSubmit={handleBootstrap}>
          <label>姓名<input name="name" autoComplete="name" required maxLength={200} /></label>
          <label>邮箱<input name="email" type="email" autoComplete="email" required maxLength={320} /></label>
          <label>密码<input name="password" type="password" autoComplete="new-password" required minLength={12} /></label>
          {error && <p role="alert" className="error">{error}</p>}
          <button disabled={busy}>{busy ? '处理中…' : '创建账户'}</button>
        </form>
      </section>
    </main>
  )

  if (authState === 'login') return (
    <main className="shell auth-shell">
      <section className="card auth-card">
        <h1>工单系统登录</h1>
        <p className="subtext">使用您的账户登录</p>
        <form className="stack" onSubmit={handleLogin}>
          <label>用户名<input name="username" autoComplete="username" required maxLength={320} /></label>
          <label>密码<input name="password" type="password" autoComplete="current-password" required /></label>
          {error && <p role="alert" className="error">{error}</p>}
          <button disabled={busy}>{busy ? '登录中…' : '登录'}</button>
        </form>
      </section>
    </main>
  )

  if (authState === 'password-change') return (
    <main className="shell auth-shell">
      <section className="card auth-card">
        <h1>更改临时密码</h1>
        <p className="subtext">继续使用前请设置新密码</p>
        <form className="stack" onSubmit={handleChangePassword}>
          <label>新密码<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
          {error && <p role="alert" className="error">{error}</p>}
          <button disabled={busy}>更新密码</button>
        </form>
      </section>
    </main>
  )

  if (!user) return null

  // ── 已认证：SPA 主界面 ──
  const visibleNav = navItems.filter((item) => item.roles.includes(user.role))
  const currentPage = visibleNav.some((n) => n.key === page) ? page : visibleNav[0]?.key ?? 'workbench'

  return (
    <div className="app-shell">
      {/* 左侧导航 */}
      <nav className="sidebar">
        <div className="sidebar-brand">
          <TicketIcon size={24} />
          <span>工单系统</span>
        </div>
        <ul className="nav-list">
          {visibleNav.map((item) => (
            <li key={item.key}>
              <button
                className={`nav-item ${currentPage === item.key ? 'active' : ''}`}
                onClick={() => setPage(item.key)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <button className="nav-item logout" onClick={handleLogout}>
            <LogoutIcon size={20} />
            <span>退出</span>
          </button>
        </div>
      </nav>

      {/* 主工作区 */}
      <div className="main-area">
        <header className="context-bar">
          <div className="context-user">
            <span className="context-name">{user.name}</span>
            <RoleLabel role={user.role} />
          </div>
          <span className="subtext">{user.email}</span>
        </header>
        <main className="main-content">
          {currentPage === 'workbench' && <WorkbenchPage role={user.role} companyId={user.companyId} />}
          {currentPage === 'tickets' && <TicketManagementPage role={user.role} companyId={user.companyId} />}
          {currentPage === 'statistics' && <StatisticsPage role={user.role} companyId={user.companyId} />}
          {currentPage === 'admin' && user.role === 'admin' && <AdminPage companyId={user.companyId} />}
          {currentPage === 'admin' && user.role !== 'admin' && (
            <div className="empty-state"><p className="error-message">无权限访问此页面</p></div>
          )}
        </main>
      </div>
    </div>
  )
}
