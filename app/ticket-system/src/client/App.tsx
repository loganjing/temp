import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { apiRequest } from './platform/api-client'
import { authApi, normalizeCurrentUser } from './api'
import type { CurrentUser } from './types'
import { ToastProvider } from './hooks/useToast'
import { Layout } from './components/Layout'
import WorkbenchPage from './pages/WorkbenchPage'
import CreateTicketPage from './pages/CreateTicketPage'
import BusinessGroupsPage from './pages/BusinessGroupsPage'
import CategoriesPage from './pages/CategoriesPage'
import StatisticsPage from './pages/StatisticsPage'
import LogsPage from './pages/LogsPage'
import UsersPage from './admin/UsersPage'

type BootstrapState = 'checking' | 'required' | 'login' | 'authenticated'

export default function App() {
  const [state, setState] = useState<BootstrapState>('checking')
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('platform-token')
    if (token) {
      try {
        const current = await authApi.me()
        setUser(current)
        if (current.passwordChangeRequired) {
          setState('authenticated')
        } else {
          setState('authenticated')
        }
        return
      } catch {
        localStorage.removeItem('platform-token')
      }
    }
    const status = await apiRequest<{ required: boolean }>('/api/auth/bootstrap-status')
    setState(status.required ? 'required' : 'login')
  }, [])

  useEffect(() => {
    void refresh().catch(() => setError('无法连接服务 / Cannot connect to server'))
  }, [refresh])

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
        const result = await apiRequest<{ token: string; user: Record<string, unknown> }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) })
        localStorage.setItem('platform-token', result.token)
        const current = await authApi.me()
        setUser(current)
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

  const logout = async () => {
    try {
      await authApi.logout()
    } catch {
      // 登出失败不阻塞前端清理
    }
    localStorage.removeItem('platform-token')
    setUser(null)
    setState('login')
  }

  // 认证门
  if (state === 'checking') {
    return (
      <BrowserRouter>
        <ToastProvider>
          <main className="shell"><p>加载中 / Loading…</p></main>
        </ToastProvider>
      </BrowserRouter>
    )
  }

  if (state === 'required' || state === 'login') {
    return (
      <BrowserRouter>
        <ToastProvider>
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
        </ToastProvider>
      </BrowserRouter>
    )
  }

  if (!user) return null

  // 强制改密门
  if (user.passwordChangeRequired) {
    return (
      <BrowserRouter>
        <ToastProvider>
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
        </ToastProvider>
      </BrowserRouter>
    )
  }

  // 已认证：渲染应用壳与路由
  return (
    <BrowserRouter>
      <ToastProvider>
        <Layout user={user} onLogout={logout}>
          <Routes>
            <Route path="/" element={<Navigate to="/workbench" replace />} />
            <Route path="/workbench" element={<WorkbenchPage user={user} />} />
            <Route path="/tickets/new" element={<CreateTicketPage />} />
            {user.role === 'admin' && (
              <>
                <Route path="/admin/statistics" element={<StatisticsPage />} />
                <Route path="/admin/business-groups" element={<BusinessGroupsPage />} />
                <Route path="/admin/categories" element={<CategoriesPage />} />
                <Route path="/admin/logs" element={<LogsPage />} />
                <Route path="/admin/users" element={<UsersPage />} />
              </>
            )}
            <Route path="*" element={<Navigate to="/workbench" replace />} />
          </Routes>
        </Layout>
      </ToastProvider>
    </BrowserRouter>
  )
}
