import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { authApi } from './api/auth'
import { describeApiError } from './api/errors'
import type { AuthUser, Profile } from './api/types'
import AppShell from './app/AppShell'
import UsersPage from './admin/UsersPage'
import BusinessGroupsPage from './admin/BusinessGroupsPage'
import CatalogPage from './admin/CatalogPage'
import WorkbenchPage from './tickets/WorkbenchPage'
import TicketDetailPage from './tickets/TicketDetailPage'
import StatisticsPage from './statistics/StatisticsPage'
import { SessionProvider } from './session'
import { ApiRequestError } from './platform/api-client'

type BootstrapState = 'checking' | 'required' | 'login' | 'authenticated'
type SessionUser = { user: AuthUser; profile: Profile | null }

export default function App() {
  const [state, setState] = useState<BootstrapState>('checking')
  const [session, setSession] = useState<SessionUser | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    const token = localStorage.getItem('platform-token')
    if (token) {
      try {
        const me = await authApi.me()
        if (typeof me?.user?.id !== 'number') throw new Error('unexpected /api/auth/me payload')
        setSession({ user: me.user, profile: me.profile ?? null })
        setState('authenticated')
        return
      } catch {
        localStorage.removeItem('platform-token')
      }
    }
    try {
      const status = await authApi.bootstrapStatus()
      setState(status.required ? 'required' : 'login')
    } catch (cause) {
      setState('login')
      if (!(cause instanceof ApiRequestError && cause.status >= 400 && cause.status < 500)) {
        setError('无法连接服务，请确认服务端已启动。')
      }
    }
  }

  useEffect(() => { void refresh().catch(() => setError('无法连接服务，请确认服务端已启动。')) }, [])

  const submitIdentity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      if (state === 'required') {
        await authApi.bootstrap({ name: String(body.name ?? ''), email: String(body.email ?? ''), password: String(body.password ?? '') })
        setState('login')
        setMessage('账户已创建，请登录。')
      } else {
        const result = await authApi.login({ email: String(body.email ?? ''), password: String(body.password ?? '') })
        if (typeof result?.token !== 'string' || typeof result.user?.id !== 'number') throw new Error('登录响应不符合契约：缺少 token 或 user。')
        localStorage.setItem('platform-token', result.token)
        setSession({ user: result.user, profile: result.profile ?? null })
        setState('authenticated')
      }
    } catch (cause) {
      setError(describeApiError(cause, '操作失败，请重试。'))
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
      setSession((current) => (current ? { ...current, user: { ...current.user, passwordChangeRequired: false } } : current))
    } catch (cause) {
      setError(describeApiError(cause, '更新密码失败。'))
    } finally {
      setBusy(false)
    }
  }

  const signOut = useCallback(() => {
    void authApi.logout().catch(() => undefined)
    localStorage.removeItem('platform-token')
    setSession(null)
    setError('')
    setMessage('')
    setState('login')
  }, [])

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
          {message && <p role="status" className="success">{message}</p>}
          {error && <p role="alert" className="error">{error}</p>}
          <button disabled={busy}>{busy ? '处理中 / Working…' : state === 'required' ? '创建账户 / Create account' : '登录 / Sign in'}</button>
        </form>
      </section>
    </main>
  )
  if (!session) return null
  if (session.user.passwordChangeRequired) return (
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
    <SessionProvider value={{ user: session.user, profile: session.profile, signOut }}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/workbench" element={<WorkbenchPage />} />
            <Route path="/tickets/:ticketId" element={<TicketDetailPage />} />
            <Route path="/statistics" element={<StatisticsPage />} />
            <Route path="/admin/groups" element={<BusinessGroupsPage />} />
            <Route path="/admin/catalog" element={<CatalogPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="*" element={<Navigate to="/workbench" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  )
}