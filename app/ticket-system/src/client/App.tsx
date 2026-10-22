import { useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from './platform/api-client'
import UsersPage from './admin/UsersPage'
import TicketWorkspace from './pages/TicketWorkspace'
import Dashboard from './pages/Dashboard'
import BusinessGroupManagement from './pages/BusinessGroupManagement'
import AssignmentRuleManagement from './pages/AssignmentRuleManagement'
import type { AuthUser } from './types'

type BootstrapState = 'checking' | 'required' | 'login' | 'authenticated'
type Page = 'workspace' | 'dashboard' | 'groups' | 'rules' | 'users' | 'settings'

interface NavItem {
  id: Page
  label: string
  roles: string[]
}

const NAV_ITEMS: NavItem[] = [
  { id: 'workspace', label: '工单工作台', roles: ['submitter', 'handler', 'admin'] },
  { id: 'dashboard', label: '统计仪表盘', roles: ['handler', 'admin'] },
  { id: 'groups', label: '业务组管理', roles: ['admin'] },
  { id: 'rules', label: '分配规则', roles: ['admin'] },
  { id: 'users', label: '用户管理', roles: ['admin'] },
  { id: 'settings', label: '个人设置', roles: ['submitter', 'handler', 'admin'] },
]

export default function App() {
  const [state, setState] = useState<BootstrapState>('checking')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState<Page>('workspace')

  const refresh = async () => {
    const token = localStorage.getItem('platform-token')
    if (token) {
      try {
        const raw = await apiRequest<AuthUser & { data?: AuthUser }>('/api/auth/me')
        const me: AuthUser = raw.data ?? raw
        setUser(me)
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
        const result = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) })
        localStorage.setItem('platform-token', result.token)
        setUser(result.user)
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

  const role = user.role ?? 'submitter'
  const visibleNav = NAV_ITEMS.filter(item => item.roles.includes(role))
  const currentNav = NAV_ITEMS.find(item => item.id === page)

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <h1>工单系统</h1>
        </div>
        <ul className="sidebar-nav">
          {visibleNav.map(item => (
            <li key={item.id}>
              <button
                className={`nav-item ${page === item.id ? 'active' : ''}`}
                onClick={() => setPage(item.id)}
              >{item.label}</button>
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <strong title={user.email}>{user.name}</strong>
            <span className="subtext" title={user.email}>{user.email}</span>
            {user.department && <span className="subtext">{user.department}</span>}
          </div>
          <button className="secondary" onClick={() => { localStorage.removeItem('platform-token'); setUser(null); setState('login') }}>退出 / Sign out</button>
        </div>
      </nav>

      <div className="main-area">
        <header className="context-bar">
          <h2>{currentNav?.label ?? '工单系统'}</h2>
        </header>
        <div className="page-content">
          {page === 'workspace' && <TicketWorkspace currentUser={user} />}
          {page === 'dashboard' && <Dashboard />}
          {page === 'groups' && <BusinessGroupManagement />}
          {page === 'rules' && <AssignmentRuleManagement />}
          {page === 'users' && <UsersPage />}
          {page === 'settings' && (
            <main className="shell">
              <section className="card auth-card">
                <h2>个人设置 / Personal settings</h2>
                <dl className="detail-meta">
                  <div><dt>姓名</dt><dd>{user.name}</dd></div>
                  <div><dt>邮箱</dt><dd>{user.email}</dd></div>
                  {user.companyName && <div><dt>公司</dt><dd>{user.companyName}</dd></div>}
                  {user.department && <div><dt>部门</dt><dd>{user.department}</dd></div>}
                  <div><dt>角色</dt><dd>{role}</dd></div>
                </dl>
                <h3>更改密码 / Change password</h3>
                <form className="stack" onSubmit={(event) => void changePassword(event)}>
                  <label>新密码 / New password<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
                  {error && <p role="alert" className="error">{error}</p>}
                  <button disabled={busy}>更新密码 / Update password</button>
                </form>
              </section>
            </main>
          )}
        </div>
      </div>
    </div>
  )
}
