import { useEffect, useState, type FormEvent } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { apiRequest } from './platform/api-client'
import { SessionProvider, useSession } from './platform/session'
import { ChartIcon, InboxIcon, QueueIcon, SettingsIcon } from './components/icons'
import { EmptyState, ForbiddenNotice } from './components/Feedback'
import { roleLabels, type CurrentUser } from './tickets/types'
import { MyTicketDetailPage, MyTicketsPage, NewTicketPage } from './tickets/MyTicketsPage'
import WorkbenchPage from './tickets/WorkbenchPage'
import StatsPage from './stats/StatsPage'
import SettingsPage from './config/SettingsPage'

type LoginUser = { id: string; name: string; email: string; passwordChangeRequired?: boolean }
type BootstrapState = 'checking' | 'required' | 'login' | 'authenticated'

export default function App() {
  const [state, setState] = useState<BootstrapState>('checking')
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const loadSession = async () => {
    const me = await apiRequest<CurrentUser>('/api/auth/me')
    setUser(me)
    setState('authenticated')
    return me
  }

  const refresh = async () => {
    const token = localStorage.getItem('platform-token')
    if (token) {
      try {
        await loadSession()
        return
      } catch {
        localStorage.removeItem('platform-token')
      }
    }
    const status = await apiRequest<{ required: boolean }>('/api/auth/bootstrap-status')
    setState(status.required ? 'required' : 'login')
  }

  useEffect(() => { void refresh().catch(() => setError('无法连接服务，请确认服务已启动后重试。')) }, [])

  const submitIdentity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      if (state === 'required') {
        await apiRequest('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(body) })
        setState('login')
        setNotice('账户已创建，请登录。')
      } else {
        const result = await apiRequest<{ token: string; user: LoginUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) })
        localStorage.setItem('platform-token', result.token)
        const me = await loadSession()
        if (result.user.passwordChangeRequired) setUser({ ...me, passwordChangeRequired: true })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败，请稍后重试。')
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
      const me = await loadSession()
      setUser({ ...me, passwordChangeRequired: false })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新密码失败，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  const signOut = () => {
    localStorage.removeItem('platform-token')
    setUser(null)
    setState('login')
    setError('')
    setNotice('')
  }

  if (state === 'checking') {
    return (
      <main className="shell auth-shell">
        <section className="card auth-card">
          {error
            ? <>
              <p role="alert" className="notice notice-error">{error}</p>
              <button type="button" onClick={() => { setError(''); void refresh().catch(() => setError('无法连接服务，请确认服务已启动后重试。')) }}>重试</button>
            </>
            : <p role="status">正在加载…</p>}
        </section>
      </main>
    )
  }

  if (state === 'required' || state === 'login') {
    return (
      <main className="shell auth-shell">
        <section className="card auth-card">
          <div className="auth-brand"><span className="brand-mark">工</span><div><strong>工单中心</strong><span className="subtext">Ticket Desk</span></div></div>
          <h1>{state === 'required' ? '创建首个账户' : '登录'}</h1>
          <p>{state === 'required' ? '仅在系统中没有用户时可执行一次。' : '使用本地账户登录后进入工单工作区。'}</p>
          <form onSubmit={(event) => void submitIdentity(event)} className="stack">
            {state === 'required' && <label>姓名<input name="name" autoComplete="name" required maxLength={200} /></label>}
            <label>邮箱<input name="email" type="email" autoComplete="email" required maxLength={320} /></label>
            <label>密码<input name="password" type="password" autoComplete={state === 'required' ? 'new-password' : 'current-password'} required minLength={state === 'required' ? 12 : 1} /></label>
            {notice && <p role="status" className="notice notice-success">{notice}</p>}
            {error && <p role="alert" className="notice notice-error">{error}</p>}
            <button disabled={busy}>{busy ? '处理中…' : state === 'required' ? '创建账户' : '登录'}</button>
          </form>
        </section>
      </main>
    )
  }

  if (!user) return null

  if (user.passwordChangeRequired) {
    return (
      <main className="shell auth-shell">
        <section className="card auth-card">
          <div className="auth-brand"><span className="brand-mark">工</span><div><strong>工单中心</strong><span className="subtext">Ticket Desk</span></div></div>
          <h1>更改临时密码</h1>
          <p>继续使用前请设置新密码（至少 12 个字符）。</p>
          <form onSubmit={(event) => void changePassword(event)} className="stack">
            <label>新密码<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
            {error && <p role="alert" className="notice notice-error">{error}</p>}
            <button disabled={busy}>{busy ? '更新中…' : '更新密码'}</button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <BrowserRouter>
      <SessionProvider user={user}>
        <AppFrame onSignOut={signOut} />
      </SessionProvider>
    </BrowserRouter>
  )
}

function AppFrame({ onSignOut }: { onSignOut: () => void }) {
  const user = useSession()
  const navItems = [
    { to: '/my-tickets', label: '我的工单', Icon: InboxIcon, show: user.role === 'submitter' },
    { to: '/workbench', label: '工单工作台', Icon: QueueIcon, show: user.role !== 'submitter' },
    { to: '/stats', label: '统计分析', Icon: ChartIcon, show: true },
    { to: '/settings', label: '配置', Icon: SettingsIcon, show: user.role === 'admin' },
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">工</span>
          <div><strong>工单中心</strong><span className="subtext">Ticket Desk</span></div>
        </div>
        <nav className="side-nav" aria-label="主导航">
          {navItems.filter((item) => item.show).map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
              <Icon /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="badge badge-role">{roleLabels[user.role]}</span>
          <span className="subtext">数据按公司与业务组范围隔离</span>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="context-bar">
            <span className="context-label">当前公司</span>
            <strong>{user.companyName ?? user.companyId}</strong>
            <span className="sep" aria-hidden="true">/</span>
            <span className="context-label">部门</span>
            <strong>{user.departmentName ?? user.departmentId}</strong>
          </div>
          <div className="topbar-user">
            <span className="identity" title={user.email}><strong>{user.name}</strong><span className="subtext">{user.email}</span></span>
            <button type="button" className="secondary btn-sm" onClick={onSignOut}>退出</button>
          </div>
        </header>

        <main className="content">
          <Routes>
            <Route path="/" element={<Navigate to={user.role === 'submitter' ? '/my-tickets' : '/workbench'} replace />} />
            {user.role === 'submitter' && <>
              <Route path="/my-tickets" element={<MyTicketsPage />} />
              <Route path="/my-tickets/new" element={<NewTicketPage />} />
              <Route path="/my-tickets/:ticketId" element={<MyTicketDetailPage />} />
            </>}
            {user.role !== 'submitter' && <>
              <Route path="/workbench" element={<WorkbenchPage />} />
              <Route path="/workbench/:ticketId" element={<WorkbenchPage />} />
            </>}
            <Route path="/stats" element={<StatsPage />} />
            {user.role === 'admin' && <Route path="/settings" element={<SettingsPage />} />}
            <Route path="*" element={<UnknownRoute />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function UnknownRoute() {
  const user = useSession()
  const { pathname } = useLocation()
  const restricted = ['/my-tickets', '/workbench', '/settings'].some((path) => pathname.startsWith(path))
  if (restricted) return <ForbiddenNotice hint="该页面仅对特定角色开放。" />
  return (
    <EmptyState
      title="页面不存在"
      hint="请从左侧导航进入需要的工作区。"
      action={<NavLink className="button-primary" to={user.role === 'submitter' ? '/my-tickets' : '/workbench'}>返回首页</NavLink>}
    />
  )
}
