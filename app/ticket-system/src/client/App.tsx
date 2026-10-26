import { useEffect, useState, type FormEvent } from 'react'
import { authApi, userApi, ApiRequestError } from './platform/api'
import type { CurrentUser } from './platform/api'
import TicketList from './pages/TicketList'
import TicketCreate from './pages/TicketCreate'
import TicketDetail from './pages/TicketDetail'
import AdminCompanies from './pages/AdminCompanies'
import AdminGroups from './pages/AdminGroups'
import AdminRules from './pages/AdminRules'
import UsersPage from './admin/UsersPage'

type BootstrapState = 'checking' | 'required' | 'login' | 'authenticated'
type Page = { name: 'tickets' | 'create' | 'detail' | 'companies' | 'groups' | 'rules' | 'users'; ticketId?: string }

export default function App() {
  const [state, setState] = useState<BootstrapState>('checking')
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState<Page>({ name: 'tickets' })

  const refresh = async () => {
    const token = localStorage.getItem('platform-token')
    if (token) {
      try {
        const u = await authApi.me()
        setUser(u)
        setState('authenticated')
        return
      } catch { localStorage.removeItem('platform-token') }
    }
    const status = await authApi.bootstrapStatus()
    setState(status.required ? 'required' : 'login')
  }

  useEffect(() => { void refresh().catch(() => setError('无法连接服务')) }, [])

  const submitIdentity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      if (state === 'required') {
        await authApi.bootstrap(body as { name: string; email: string; password: string; role?: string; company?: string; department?: string })
        setState('login')
        setError('账户已创建，请登录')
      } else {
        const result = await authApi.login(body as { email: string; password: string })
        localStorage.setItem('platform-token', result.token)
        setUser(result.user)
        setState('authenticated')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败')
    } finally { setBusy(false) }
  }

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      await authApi.changePassword(body as { password: string })
      setUser(user ? { ...user, passwordChangeRequired: false } : user)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新密码失败')
    } finally { setBusy(false) }
  }

  const navItems: { key: Page['name']; label: string }[] = (() => {
    if (!user) return []
    const role = user.role
    if (role === 'submitter') return [{ key: 'tickets', label: '工单列表' }, { key: 'create', label: '创建工单' }]
    if (role === 'handler') return [{ key: 'tickets', label: '待处理工单' }]
    return [{ key: 'tickets', label: '工单管理' }, { key: 'companies', label: '公司管理' }, { key: 'groups', label: '业务组管理' }, { key: 'rules', label: '分配规则' }, { key: 'users', label: '用户管理' }]
  })()

  if (state === 'checking') return <main className="shell"><p>加载中…</p></main>
  if (state === 'required' || state === 'login') return (
    <main className="shell auth-shell">
      <section className="card auth-card">
        <h1>{state === 'required' ? '创建首个账户' : '登录'}</h1>
        <p>{state === 'required' ? '设置管理员账户以初始化系统' : '使用本地账户登录'}</p>
        <form onSubmit={(event) => void submitIdentity(event)} className="stack">
          {state === 'required' && <>
            <label>姓名<input name="name" required maxLength={200} /></label>
            <label>邮箱<input name="email" type="email" required maxLength={320} /></label>
            <label>密码<input name="password" type="password" required minLength={12} /></label>
            <label>角色<select name="role" defaultValue="admin"><option value="admin">管理员</option><option value="submitter">提交人</option><option value="handler">处理人</option></select></label>
            <label>公司（可选）<input name="company" /></label>
            <label>部门（可选）<input name="department" /></label>
          </>}
          {state === 'login' && <>
            <label>邮箱<input name="email" type="email" required maxLength={320} /></label>
            <label>密码<input name="password" type="password" required /></label>
          </>}
          {error && <p role="alert" className="error">{error}</p>}
          <button disabled={busy}>{busy ? '处理中…' : state === 'required' ? '创建账户' : '登录'}</button>
        </form>
      </section>
    </main>
  )
  if (!user) return null
  if (user.passwordChangeRequired) return (
    <main className="shell auth-shell">
      <section className="card auth-card">
        <h1>更改临时密码</h1>
        <p>继续使用前请设置新密码。</p>
        <form onSubmit={(event) => void changePassword(event)} className="stack">
          <label>新密码<input name="password" type="password" minLength={12} required /></label>
          {error && <p role="alert" className="error">{error}</p>}
          <button disabled={busy}>更新密码</button>
        </form>
      </section>
    </main>
  )

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1 className="logo">工单系统</h1>
        <nav>
          {navItems.map((item) => (
            <button key={item.key} className={page.name === item.key ? 'nav-item active' : 'nav-item'} onClick={() => setPage({ name: item.key })}>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div><span className="subtext">{user.name} · {user.email} · {user.role}</span></div>
          <button className="secondary" onClick={() => { localStorage.removeItem('platform-token'); setUser(null); setState('login') }}>退出</button>
        </header>
        <div className="content">
          {page.name === 'tickets' && <TicketList role={user.role} onOpenTicket={(id) => setPage({ name: 'detail', ticketId: id })} />}
          {page.name === 'create' && <TicketCreate onCreated={(id) => setPage({ name: 'detail', ticketId: id })} />}
          {page.name === 'detail' && page.ticketId && <TicketDetail ticketId={page.ticketId} role={user.role} onBack={() => setPage({ name: 'tickets' })} />}
          {page.name === 'companies' && <AdminCompanies />}
          {page.name === 'groups' && <AdminGroups />}
          {page.name === 'rules' && <AdminRules />}
          {page.name === 'users' && <UsersPage />}
        </div>
      </main>
    </div>
  )
}
