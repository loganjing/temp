import { useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from './platform/api-client'
import UsersPage from './admin/UsersPage'
import Workbench from './pages/Workbench'
import Statistics from './pages/Statistics'
import AdminConfig from './pages/AdminConfig'
import { ToastProvider } from './components/Toast'
import type { CurrentUser } from './api/ticket-api'

type BootstrapState = 'checking' | 'required' | 'login' | 'authenticated'
type NavView = 'workbench' | 'statistics' | 'admin' | 'users'

const NAV_ITEMS: { view: NavView; label: string }[] = [
  { view: 'workbench', label: '工单工作台' },
  { view: 'statistics', label: '统计分析' },
  { view: 'admin', label: '管理配置' },
  { view: 'users', label: '用户管理' },
]

const VIEW_TITLES: Record<NavView, string> = {
  workbench: '工单工作台',
  statistics: '统计分析',
  admin: '管理配置',
  users: '用户管理',
}

export default function App() {
  const [state, setState] = useState<BootstrapState>('checking')
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<NavView>('workbench')

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
        const result = await apiRequest<{ token: string; user: CurrentUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) })
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

  return (
    <ToastProvider>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--page)' }}>
        {/* Sidebar */}
        <aside style={{
          width: '220px', flexShrink: 0, background: 'var(--surface)',
          borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)' }}>
            <strong style={{ fontSize: '1.05rem' }}>工单系统</strong>
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', padding: '0.5rem', gap: '0.25rem', flex: 1 }}>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.view}
                onClick={() => setView(item.view)}
                className={view === item.view ? '' : 'secondary'}
                style={{
                  textAlign: 'left', minHeight: 'auto', padding: '0.6rem 0.85rem',
                  fontSize: '0.9rem', border: 'none', borderRadius: '6px',
                  background: view === item.view ? 'var(--accent)' : 'transparent',
                  color: view === item.view ? 'white' : 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main area */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Top context bar */}
          <header style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
            padding: '0.85rem 1.25rem', background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
          }}>
            <h1 style={{ margin: 0, fontSize: '1.1rem' }}>{VIEW_TITLES[view]}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }} title={user.email}>
                {user.name} · {user.email}
              </span>
              <button className="secondary" style={{ minHeight: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }} onClick={signOut}>
                退出
              </button>
            </div>
          </header>

          {/* Content */}
          <main style={{ flex: 1, padding: '1.25rem', overflow: 'auto' }}>
            <div className="shell" style={{ width: '100%', maxWidth: '1400px', margin: 0, padding: 0 }}>
              {view === 'workbench' && <Workbench user={user} />}
              {view === 'statistics' && <Statistics />}
              {view === 'admin' && <AdminConfig />}
              {view === 'users' && <UsersPage />}
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
