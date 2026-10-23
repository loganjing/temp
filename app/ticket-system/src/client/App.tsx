import { useEffect, useState, type FormEvent } from 'react'
import { auth } from './api'
import type { CurrentUser } from './types'
import WorkbenchPage from './pages/WorkbenchPage'
import TicketsPage from './pages/TicketsPage'
import StatisticsPage from './pages/StatisticsPage'
import BusinessGroupsPage from './pages/BusinessGroupsPage'
import AssignmentRulesPage from './pages/AssignmentRulesPage'
import AuditLogsPage from './pages/AuditLogsPage'

type BootstrapState = 'checking' | 'required' | 'login' | 'authenticated'
type PageKey = 'workbench' | 'tickets' | 'statistics' | 'business-groups' | 'assignment-rules' | 'audit-logs'

const NAV_ITEMS: { key: PageKey; label: string }[] = [
  { key: 'workbench', label: '工单工作台' },
  { key: 'tickets', label: '工单管理' },
  { key: 'statistics', label: '统计分析' },
  { key: 'business-groups', label: '业务组管理' },
  { key: 'assignment-rules', label: '分配规则' },
  { key: 'audit-logs', label: '操作日志' },
]

export default function App() {
  const [state, setState] = useState<BootstrapState>('checking')
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState<PageKey>('workbench')

  const refresh = async () => {
    const token = localStorage.getItem('platform-token')
    if (token) {
      try {
        setUser(await auth.me())
        setState('authenticated')
        return
      } catch {
        localStorage.removeItem('platform-token')
      }
    }
    const status = await auth.bootstrapStatus()
    setState(status.required ? 'required' : 'login')
  }

  useEffect(() => {
    void refresh().catch(() => setError('无法连接服务 / Cannot connect to server'))
  }, [])

  const submitIdentity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      if (state === 'required') {
        await auth.bootstrap({
          name: String(body.name),
          email: String(body.email),
          password: String(body.password),
        })
        setState('login')
        setError('账户已创建，请登录 / Account created. Please sign in.')
      } else {
        const result = await auth.login(String(body.email), String(body.password))
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
      await auth.changePassword(String(body.password))
      setUser(user ? { ...user, passwordChangeRequired: false } : user)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新密码失败 / Password update failed')
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    try {
      await auth.logout()
    } catch {
      // 忽略登出失败
    }
    localStorage.removeItem('platform-token')
    setUser(null)
    setState('login')
  }

  if (state === 'checking')
    return (
      <main className="shell">
        <p>加载中 / Loading…</p>
      </main>
    )

  if (state === 'required' || state === 'login')
    return (
      <main className="shell auth-shell">
        <section className="card auth-card">
          <h1>{state === 'required' ? '创建首个账户 / Set up the first account' : '登录 / Sign in'}</h1>
          <p>
            {state === 'required'
              ? '仅在没有用户时可执行一次。/ Available once while no users exist.'
              : '使用本地账户登录。/ Sign in with your local account.'}
          </p>
          <form onSubmit={(event) => void submitIdentity(event)} className="stack">
            {state === 'required' && (
              <label>
                姓名 / Name
                <input name="name" autoComplete="name" required maxLength={200} />
              </label>
            )}
            <label>
              邮箱 / Email
              <input name="email" type="email" autoComplete="email" required maxLength={320} />
            </label>
            <label>
              密码 / Password
              <input
                name="password"
                type="password"
                autoComplete={state === 'required' ? 'new-password' : 'current-password'}
                required
                minLength={state === 'required' ? 12 : 1}
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button disabled={busy}>
              {busy
                ? '处理中 / Working…'
                : state === 'required'
                  ? '创建账户 / Create account'
                  : '登录 / Sign in'}
            </button>
          </form>
        </section>
      </main>
    )

  if (!user) return null

  if (user.passwordChangeRequired)
    return (
      <main className="shell auth-shell">
        <section className="card auth-card">
          <h1>更改临时密码 / Change temporary password</h1>
          <p>继续使用前请设置新密码。/ Set a new password before continuing.</p>
          <form onSubmit={(event) => void changePassword(event)} className="stack">
            <label>
              新密码 / New password
              <input name="password" type="password" autoComplete="new-password" minLength={12} required />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button disabled={busy}>更新密码 / Update password</button>
          </form>
        </section>
      </main>
    )

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">工单系统</div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${page === item.key ? 'active' : ''}`}
              onClick={() => setPage(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="main-area">
        <header className="context-bar">
          <div className="context-company">
            {user.companyId ? `公司: ${user.companyId}` : '工单系统'}
          </div>
          <div className="context-user">
            <span title={user.email}>
              {user.name} · {user.email}
            </span>
            <button className="secondary" onClick={() => void logout()}>
              登出
            </button>
          </div>
        </header>
        <main className="main-content">
          {page === 'workbench' && <WorkbenchPage />}
          {page === 'tickets' && <TicketsPage />}
          {page === 'statistics' && <StatisticsPage />}
          {page === 'business-groups' && <BusinessGroupsPage />}
          {page === 'assignment-rules' && <AssignmentRulesPage />}
          {page === 'audit-logs' && <AuditLogsPage />}
        </main>
      </div>
    </div>
  )
}
