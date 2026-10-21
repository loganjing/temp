import { useEffect, useState, type FormEvent } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { identityApi } from './platform/api-client'
import type { SessionUser } from './components/contracts'
import { ToastProvider, useToast } from './components/ui'
import UsersPage from './admin/UsersPage'
import WorkbenchPage from './pages/WorkbenchPage'
import TicketsPage from './pages/TicketsPage'
import TicketCreatePage from './pages/TicketCreatePage'
import GroupsRulesPage from './pages/GroupsRulesPage'
import StatsPage from './pages/StatsPage'
import AuditLogsPage from './pages/AuditLogsPage'

type BootstrapState = 'checking' | 'required' | 'login' | 'authenticated'

export default function App() {
  const [state, setState] = useState<BootstrapState>('checking')
  const [user, setUser] = useState<SessionUser | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const refresh = async () => {
    const token = localStorage.getItem('platform-token')
    if (token) {
      try {
        const me = await identityApi.me()
        setUser(me)
        setState('authenticated')
        return
      } catch {
        localStorage.removeItem('platform-token')
      }
    }
    const status = await identityApi.bootstrapStatus()
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
        await identityApi.bootstrap({ name: String(body.name), email: String(body.email), password: String(body.password) })
        setState('login')
        toast.success('账户已创建，请登录')
      } else {
        const result = await identityApi.login(String(body.email), String(body.password))
        localStorage.setItem('platform-token', result.token)
        setUser(result.user)
        setState('authenticated')
        toast.success(`欢迎，${result.user.name}`)
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
      await identityApi.changePassword(String(body.password))
      setUser(user ? { ...user, passwordChangeRequired: false } : user)
      toast.success('密码已更新')
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
      <BrowserRouter>
        <AppShell user={user} onSignOut={signOut} />
      </BrowserRouter>
    </ToastProvider>
  )
}

interface NavItem { to: string; label: string }
const NAV: NavItem[] = [
  { to: '/workbench', label: '工作台' },
  { to: '/tickets', label: '工单' },
  { to: '/stats', label: '统计' },
  { to: '/groups', label: '业务组与规则' },
  { to: '/audit', label: '操作日志' },
  { to: '/users', label: '用户管理' },
]

function AppShell({ user, onSignOut }: { user: SessionUser; onSignOut: () => void }) {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">工单系统</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-700 dark:bg-slate-800">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100" title={user.name}>{user.name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400" title={user.email}>{user.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300" title={`公司：${user.company?.name}`}>
              {user.company?.name ?? '—'}
            </span>
            <button className="secondary" onClick={onSignOut}>退出 / Sign out</button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-5">
          <Routes>
            <Route path="/" element={<Navigate to="/workbench" replace />} />
            <Route path="/workbench" element={<WorkbenchPage currentUser={user} />} />
            <Route path="/tickets" element={<TicketsPage currentUser={user} />} />
            <Route path="/tickets/new" element={<TicketCreatePage currentUser={user} />} />
            <Route path="/tickets/:ticketNo" element={<TicketsPage currentUser={user} />} />
            <Route path="/stats" element={<StatsPage currentUser={user} />} />
            <Route path="/groups" element={<GroupsRulesPage currentUser={user} />} />
            <Route path="/audit" element={<AuditLogsPage currentUser={user} />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="*" element={<Navigate to="/workbench" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
