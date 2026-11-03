import { useEffect, useState, type FormEvent } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom'
import { authApi, type CurrentUser } from './platform/api-client'
import WorkbenchPage from './pages/WorkbenchPage'
import CreateTicketPage from './pages/CreateTicketPage'
import TicketDetailRoute from './pages/TicketDetailRoute'
import BusinessGroupPage from './pages/BusinessGroupPage'
import StatsPage from './pages/StatsPage'
import UsersPage from './pages/UsersPage'

type BootstrapState = 'checking' | 'required' | 'login' | 'authenticated'

const NAV_ITEMS = [
  { to: '/workbench', label: '工单工作台' },
  { to: '/tickets/new', label: '创建工单' },
  { to: '/business-groups', label: '业务组管理' },
  { to: '/stats', label: '统计分析' },
  { to: '/users', label: '用户管理' },
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
        setUser(await authApi.me())
        setState('authenticated')
        return
      } catch {
        localStorage.removeItem('platform-token')
      }
    }
    const status = await authApi.bootstrapStatus()
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
        await authApi.bootstrap(body as Record<string, string>)
        setState('login')
        setError('账户已创建，请登录 / Account created. Please sign in.')
      } else {
        const result = await authApi.login(String(body.email), String(body.password))
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
      await authApi.changePassword(String(body.password))
      setUser(user ? { ...user, passwordChangeRequired: false } : user)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新密码失败 / Password update failed')
    } finally {
      setBusy(false)
    }
  }

  const signOut = () => {
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

  const departmentName = user.department?.name ?? ''
  return (
    <BrowserRouter>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">工单系统</div>
          <nav className="nav">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>{item.label}</NavLink>
            ))}
          </nav>
          <button className="secondary sign-out" onClick={signOut}>退出登录</button>
        </aside>
        <div className="main-area">
          <header className="topbar context-bar">
            <div>
              <h1>工单工作台</h1>
              <p title={user.email}>{user.name} · {user.email}{departmentName ? ` · ${departmentName}` : ''}{user.companyId ? '' : ' · 未关联公司'}</p>
            </div>
          </header>
          <main className="content">
            <Routes>
              <Route path="/" element={<Navigate to="/workbench" replace />} />
              <Route path="/workbench" element={<WorkbenchPage currentUser={user} />} />
              <Route path="/tickets/new" element={<CreateTicketPage />} />
              <Route path="/tickets/:id" element={<TicketDetailRoute currentUser={user} />} />
              <Route path="/business-groups" element={<BusinessGroupPage currentUser={user} />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}

function NotFound() {
  const navigate = useNavigate()
  return (
    <section className="card">
      <h2>页面未找到</h2>
      <p className="muted">请求的页面不存在。</p>
      <button className="secondary" onClick={() => navigate('/workbench')}>返回工作台</button>
    </section>
  )
}
