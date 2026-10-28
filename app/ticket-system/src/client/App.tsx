import { useEffect, useState, type FormEvent } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { apiRequest, authApi } from './platform/api-client'
import { ToastProvider } from './platform/ui'
import type { CurrentUser } from './platform/types'
import WorkbenchPage from './tickets/WorkbenchPage'
import CreateTicketPage from './tickets/CreateTicketPage'
import MyTicketsPage from './tickets/MyTicketsPage'
import DashboardPage from './tickets/DashboardPage'
import ManagementPage from './admin/ManagementPage'
import AuditLogPage from './admin/AuditLogPage'

type BootstrapState = 'checking' | 'required' | 'login' | 'authenticated'

type LoginUser = { id: string; name: string; email: string; passwordChangeRequired?: boolean }

const NAV_ITEMS = [
  { to: '/', label: '工单工作台 / Workbench', end: true },
  { to: '/tickets/new', label: '创建工单 / Create', end: false },
  { to: '/my-tickets', label: '我的工单 / My tickets', end: false },
  { to: '/dashboard', label: '统计仪表盘 / Dashboard', end: false },
  { to: '/admin', label: '管理 / Admin', end: false },
  { to: '/audit-logs', label: '审计日志 / Audit logs', end: false },
]

export default function App() {
  const [state, setState] = useState<BootstrapState>('checking')
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    const token = localStorage.getItem('platform-token')
    if (token) {
      try {
        setUser(await apiRequest<CurrentUser>('/api/auth/me'))
        setState('authenticated')
        return
      } catch {
        localStorage.removeItem('platform-token')
      }
    }
    const status = await apiRequest<{ required: boolean }>('/api/auth/bootstrap-status')
    setState(status.required ? 'required' : 'login')
  }

  useEffect(() => { void refresh().catch(() => setError('无法连接服务 / Cannot connect to server')) }, [])

  const submitIdentity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      if (state === 'required') {
        await apiRequest('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(body) })
        setState('login')
        setError('账户已创建，请登录 / Account created. Please sign in.')
      } else {
        const result = await apiRequest<{ token: string; user: LoginUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) })
        localStorage.setItem('platform-token', result.token)
        const me = await apiRequest<CurrentUser>('/api/auth/me')
        setUser(me)
        setState('authenticated')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败 / Request failed')
    } finally {
      setBusy(false)
    }
  }

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      await apiRequest('/api/auth/password', { method: 'POST', body: JSON.stringify(body) })
      setUser(user ? { ...user, passwordChangeRequired: false } : user)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新密码失败 / Password update failed')
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    try { await authApi.logout() } catch { /* 忽略登出失败 */ }
    localStorage.removeItem('platform-token')
    setUser(null)
    setState('login')
  }

  if (state === 'checking') return <main className="shell"><p>加载中 / Loading…</p></main>

  if (state === 'required' || state === 'login') return (
    <main className="shell auth-shell">
      <section className="card auth-card">
        <h1>{state === 'required' ? '创建首个账户 / Set up the first account' : '登录 / Sign in'}</h1>
        <p>{state === 'required' ? '仅在没有用户时可执行一次。/ Available once while no users exist.' : '使用本地账户登录。/ Sign in with your local account.'}</p>
        <form onSubmit={(event) => void submitIdentity(event)} className="stack">
          {state === 'required' && <label>姓名 / Name<input name="name" autoComplete="name" required maxLength={200} /></label>}
          <label>邮箱 / Email<input name="email" type="email" autoComplete="email" required maxLength={320} /></label>
          <label>密码 / Password<input name="password" type="password" autoComplete={state === 'required' ? 'new-password' : 'current-password'} required minLength={state === 'required' ? 12 : 1} /></label>
          {error && <p role="alert" className="error">{error}</p>}
          <button disabled={busy}>{busy ? '处理中 / Working…' : state === 'required' ? '创建账户 / Create account' : '登录 / Sign in'}</button>
        </form>
      </section>
    </main>
  )

  if (!user) return null

  if (user.passwordChangeRequired) return (
    <main className="shell auth-shell">
      <section className="card auth-card">
        <h1>更改临时密码 / Change temporary password</h1>
        <p>继续使用前请设置新密码。/ Set a new password before continuing.</p>
        <form onSubmit={(event) => void changePassword(event)} className="stack">
          <label>新密码 / New password<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
          {error && <p role="alert" className="error">{error}</p>}
          <button disabled={busy}>更新密码 / Update password</button>
        </form>
      </section>
    </main>
  )

  const displayName = user.displayName ?? user.name ?? user.email

  return (
    <ToastProvider>
      <BrowserRouter>
        <div className="app-shell">
          <nav className="sidebar" aria-label="主导航 / Primary">
            <div className="sidebar-brand">工单系统 / Tickets</div>
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="app-main">
            <header className="topbar">
              <div><h1>工单系统 / Ticket System</h1><p title={user.email}>{displayName} · {user.email}</p></div>
              <button className="secondary" onClick={() => void signOut()}>退出 / Sign out</button>
            </header>
            <Routes>
              <Route path="/" element={<WorkbenchPage user={user} />} />
              <Route path="/tickets/new" element={<CreateTicketPage />} />
              <Route path="/my-tickets" element={<MyTicketsPage />} />
              <Route path="/dashboard" element={<DashboardPage user={user} />} />
              <Route path="/admin" element={<ManagementPage />} />
              <Route path="/audit-logs" element={<AuditLogPage />} />
              <Route path="*" element={<WorkbenchPage user={user} />} />
            </Routes>
          </div>
        </div>
      </BrowserRouter>
    </ToastProvider>
  )
}
