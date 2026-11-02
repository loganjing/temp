import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { apiRequest } from './platform/api-client'
import { authApi } from './api/auth'
import type { UserInfo } from './types'
import { ROLE_LABEL } from './lib/constants'
import { ChartIcon, InboxIcon, LogOutIcon, TagIcon, TicketIcon, UsersIcon } from './components/Icon'
import { WorkbenchPage } from './pages/WorkbenchPage'
import { TicketManagementPage } from './pages/TicketManagementPage'
import { StatisticsPage } from './pages/StatisticsPage'
import { GroupManagementPage } from './pages/GroupManagementPage'
import { CategoryManagementPage } from './pages/CategoryManagementPage'

type BootstrapState = 'checking' | 'required' | 'login' | 'authenticated'

type NavKey = 'workbench' | 'tickets' | 'statistics' | 'groups' | 'categories'

const NAV_ITEMS: { key: NavKey; label: string; icon: typeof InboxIcon; roles?: UserInfo['role'][] }[] = [
  { key: 'workbench', label: '工单工作台', icon: InboxIcon },
  { key: 'tickets', label: '工单管理', icon: TicketIcon },
  { key: 'statistics', label: '统计分析', icon: ChartIcon, roles: ['admin'] },
  { key: 'groups', label: '业务组管理', icon: UsersIcon, roles: ['admin'] },
  { key: 'categories', label: '分类管理', icon: TagIcon, roles: ['admin'] },
]

export default function App() {
  const [state, setState] = useState<BootstrapState>('checking')
  const [user, setUser] = useState<UserInfo | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [nav, setNav] = useState<NavKey>('workbench')

  const refresh = async () => {
    const token = localStorage.getItem('platform-token')
    if (token) {
      try {
        const me = await authApi.me()
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
        const result = await authApi.login({ username: String(body.username ?? body.email ?? ''), password: String(body.password ?? '') })
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
      await authApi.changePassword({ password: String(body.password ?? '') })
      setUser((prev) => (prev ? { ...prev, passwordChangeRequired: false } : prev))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新密码失败 / Password update failed')
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    localStorage.removeItem('platform-token')
    setUser(null)
    setState('login')
  }

  if (state === 'checking') return <main className="flex min-h-screen items-center justify-center"><p className="text-sm text-slate-500">加载中 / Loading…</p></main>

  if (state === 'required' || state === 'login') return (
    <main className="auth-shell">
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
    <main className="auth-shell">
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

  // 角色判定兼容服务端返回的 roles 数组或单个 role 字段。
  const roles = useMemo(() => {
    const set = new Set<UserInfo['role']>()
    if (user.role) set.add(user.role)
    if (user.roles) for (const r of user.roles) set.add(r as UserInfo['role'])
    return set
  }, [user])

  const visibleNav = NAV_ITEMS.filter((item) => !item.roles || item.roles.some((r) => roles.has(r)))
  const activeNav = visibleNav.some((item) => item.key === nav) ? nav : visibleNav[0]?.key ?? 'workbench'

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* 左侧导航栏 */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-4 py-4">
          <TicketIcon size={20} className="text-blue-600" />
          <span className="text-sm font-semibold text-slate-800">工单系统</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          {visibleNav.map((item) => {
            const Icon = item.icon
            const active = activeNav === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setNav(item.key)}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <Icon size={17} /> {item.label}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* 主区域 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶部上下文栏 */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800" title={user.companyName || user.companyId}>
              {user.companyName || '当前公司'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-700">{user.fullName || user.name || user.username}</p>
              <p className="text-xs text-slate-500">{ROLE_LABEL[user.role] ?? user.role}{user.email ? ` · ${user.email}` : ''}</p>
            </div>
            <button type="button" className="secondary !min-h-0 !px-2.5 !py-1.5 inline-flex items-center gap-1.5 text-xs" onClick={() => void signOut()}>
              <LogOutIcon size={14} /> 退出
            </button>
          </div>
        </header>

        {/* 主工作区 */}
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {activeNav === 'workbench' && <WorkbenchPage user={user} />}
          {activeNav === 'tickets' && <TicketManagementPage user={user} />}
          {activeNav === 'statistics' && <StatisticsPage user={user} />}
          {activeNav === 'groups' && <GroupManagementPage user={user} />}
          {activeNav === 'categories' && <CategoryManagementPage user={user} />}
        </main>
      </div>
    </div>
  )
}
