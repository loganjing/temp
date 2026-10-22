import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { ApiRequestError, apiRequest, describeError } from './platform/api-client'
import UsersPage from './admin/UsersPage'
import { ErrorState, NoPermissionState } from './platform/states'
import { fetchMeContext } from './tickets/api'
import { label, roleLabels } from './tickets/labels'
import { PERMISSIONS, type MeContext, type PermissionKey } from '../shared/contracts'
import TicketWorkbenchPage from './tickets/TicketWorkbenchPage'
import MyTicketsPage from './tickets/MyTicketsPage'
import OrgConfigPage from './config/OrgConfigPage'
import AnalyticsPage from './analytics/AnalyticsPage'
import AuditLogPage from './audit/AuditLogPage'

type CurrentUser = { id: string; name: string; email: string; passwordChangeRequired?: boolean }
type BootstrapState = 'checking' | 'required' | 'login' | 'authenticated'
type ContextState = 'idle' | 'loading' | 'ready' | 'error' | 'forbidden'

// 导航可见项由 GET /api/me/context 的权限集合决定。
const navItems: { to: string; text: string; permission: PermissionKey | null }[] = [
  { to: '/workbench', text: '工单工作台 / Workbench', permission: PERMISSIONS.TICKET_READ },
  { to: '/my-tickets', text: '我的工单 / My tickets', permission: PERMISSIONS.TICKET_READ },
  { to: '/config', text: '业务组与分配规则 / Groups & rules', permission: PERMISSIONS.ORG_READ },
  { to: '/analytics', text: '统计与分析 / Analytics', permission: PERMISSIONS.ANALYTICS_READ },
  { to: '/audit', text: '操作日志 / Audit log', permission: PERMISSIONS.AUDIT_READ },
  { to: '/users', text: '用户管理 / User management', permission: null },
]

export default function App() {
  const [state, setState] = useState<BootstrapState>('checking')
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [context, setContext] = useState<MeContext | null>(null)
  const [contextState, setContextState] = useState<ContextState>('idle')
  const [contextError, setContextError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const signOut = useCallback(() => {
    localStorage.removeItem('platform-token')
    setUser(null)
    setContext(null)
    setContextState('idle')
    setContextError('')
    setState('login')
  }, [])

  const loadContext = useCallback(async () => {
    setRefreshing(true)
    setContextError('')
    try {
      setContext(await fetchMeContext())
      setContextState('ready')
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 401) {
        signOut()
        return
      }
      setContextError(describeError(cause, '无法加载账号上下文 / Could not load account context'))
      setContextState(cause instanceof ApiRequestError && cause.status === 403 ? 'forbidden' : 'error')
    } finally {
      setRefreshing(false)
    }
  }, [signOut])

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('platform-token')
    if (token) {
      try {
        setUser(await apiRequest<CurrentUser>('/api/auth/me'))
        setState('authenticated')
        await loadContext()
        return
      } catch {
        localStorage.removeItem('platform-token')
      }
    }
    const status = await apiRequest<{ required: boolean }>('/api/auth/bootstrap-status')
    setState(status.required ? 'required' : 'login')
  }, [loadContext])

  useEffect(() => { void refresh().catch(() => setError('无法连接服务 / Cannot connect to server')) }, [refresh])

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
        const result = await apiRequest<{ token: string; user: CurrentUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) })
        localStorage.setItem('platform-token', result.token)
        setUser(result.user)
        setState('authenticated')
        await loadContext()
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
  if (contextState === 'idle' || contextState === 'loading') return <main className="shell"><p>加载账号上下文 / Loading account context…</p></main>
  if (contextState === 'forbidden') return (
    <main className="shell auth-shell">
      <section className="card auth-card">
        <h1>无权限 / No permission</h1>
        <p>当前账号无法使用工单系统，请确认账号所属公司与角色。/ This account cannot use the ticket system.</p>
        {contextError && <p className="error">{contextError}</p>}
        <button className="secondary" onClick={signOut}>退出 / Sign out</button>
      </section>
    </main>
  )
  if (contextState === 'error' || !context) return (
    <main className="shell auth-shell">
      <section className="card auth-card">
        <h1>无法加载账号上下文 / Could not load account context</h1>
        <ErrorState message={contextError || '未知错误 / Unknown error'} onRetry={() => void loadContext()} />
        <button className="secondary" onClick={signOut}>退出 / Sign out</button>
      </section>
    </main>
  )

  const visibleNav = navItems.filter((item) => !item.permission || context.permissions.includes(item.permission))
  const landing = visibleNav[0]?.to ?? '/users'
  const guard = (permission: PermissionKey, element: ReactElement) => (context.permissions.includes(permission) ? element : <NoPermissionState />)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>工单系统 / Ticket system</strong>
          <span className="subtext">{context.companyName}</span>
        </div>
        <nav className="nav">
          {visibleNav.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>{item.text}</NavLink>
          ))}
        </nav>
      </aside>
      <div className="app-main">
        <header className="context-bar">
          <div className="who">
            <strong>{context.displayName}</strong>
            <span className="subtext" title={context.email}>{context.email}</span>
          </div>
          <div className="who">
            <strong>{context.companyName}{context.departmentName ? ` · ${context.departmentName}` : ''}</strong>
            <span className="subtext">{context.roles.map((role) => label(roleLabels, role)).join('、')}</span>
          </div>
          <div className="context-actions">
            <button className="secondary" onClick={() => void loadContext()} disabled={refreshing}>刷新上下文 / Refresh context</button>
            <button className="secondary" onClick={signOut}>退出 / Sign out</button>
          </div>
        </header>
        <main className="workspace">
          <Routes>
            <Route path="/" element={<Navigate to={landing} replace />} />
            <Route path="/workbench" element={guard(PERMISSIONS.TICKET_READ, <TicketWorkbenchPage context={context} />)} />
            <Route path="/my-tickets" element={guard(PERMISSIONS.TICKET_READ, <MyTicketsPage context={context} />)} />
            <Route path="/config" element={guard(PERMISSIONS.ORG_READ, <OrgConfigPage context={context} />)} />
            <Route path="/analytics" element={guard(PERMISSIONS.ANALYTICS_READ, <AnalyticsPage context={context} />)} />
            <Route path="/audit" element={guard(PERMISSIONS.AUDIT_READ, <AuditLogPage context={context} />)} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="*" element={<Navigate to={landing} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
