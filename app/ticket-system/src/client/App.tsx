import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { apiRequest } from './platform/api-client'
import { AppShell, SessionContext } from './components/AppShell'
import WorkbenchPage from './pages/WorkbenchPage'
import MyTicketsPage from './pages/MyTicketsPage'
import StatsPage from './pages/StatsPage'
import GroupsPage from './pages/GroupsPage'
import RulesPage from './pages/RulesPage'
import LogsPage from './pages/LogsPage'
import OutboxPage from './pages/OutboxPage'
import UsersPage from './admin/UsersPage'
import type { CurrentUser } from './types'

type GateState = 'checking' | 'setup' | 'login' | 'change-password' | 'ready'

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">{children}</section>
    </main>
  )
}

function ErrorText({ error }: { error: string }) {
  if (!error) return null
  return (
    <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
      {error}
    </p>
  )
}

export default function App() {
  const [state, setState] = useState<GateState>('checking')
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('platform-token')
    const boot = async () => {
      if (token) {
        try {
          const me = await apiRequest<CurrentUser>('/api/auth/me')
          setUser(me)
          setState(me.passwordChangeRequired ? 'change-password' : 'ready')
          return
        } catch {
          localStorage.removeItem('platform-token')
        }
      }
      const status = await apiRequest<{ required: boolean }>('/api/auth/bootstrap-status')
      setState(status.required ? 'setup' : 'login')
    }
    void boot().catch(() => setError('无法连接服务，请确认后端已启动后重试'))
  }, [])

  const submitIdentity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const raw = Object.fromEntries(new FormData(formElement).entries()) as Record<string, string>
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (state === 'setup') {
        const body: Record<string, string> = { name: raw.name, email: raw.email, password: raw.password }
        if (raw.companyName?.trim()) body.companyName = raw.companyName.trim()
        if (raw.department?.trim()) body.department = raw.department.trim()
        await apiRequest('/api/auth/bootstrap', { method: 'POST', body: JSON.stringify(body) })
        formElement.reset()
        setState('login')
        setNotice('首个账户已创建，请使用邮箱登录。')
      } else {
        const result = await apiRequest<{ token: string; user: CurrentUser }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: raw.email, password: raw.password }),
        })
        localStorage.setItem('platform-token', result.token)
        setUser(result.user)
        setNotice('')
        setState(result.user.passwordChangeRequired ? 'change-password' : 'ready')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const raw = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>
    setBusy(true)
    setError('')
    try {
      await apiRequest('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify({ password: raw.password }),
      })
      setUser(user ? { ...user, passwordChangeRequired: false } : user)
      setState('ready')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新密码失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' })
    } catch {
      // 登出失败仍继续本地会话清理
    }
    localStorage.removeItem('platform-token')
    setUser(null)
    setError('')
    setNotice('')
    setState('login')
  }

  if (state === 'checking') {
    return (
      <AuthShell>
        <p className="text-sm text-slate-500">加载中…</p>
      </AuthShell>
    )
  }

  if (state === 'setup' || state === 'login') {
    const isSetup = state === 'setup'
    return (
      <AuthShell>
        <h1 className="text-lg font-semibold text-slate-800">
          {isSetup ? '创建首个账户' : '登录工单系统'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isSetup ? '系统尚无用户，仅可执行一次初始化。' : '使用本地账户邮箱登录。'}
        </p>
        {notice && (
          <p role="status" className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
            {notice}
          </p>
        )}
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submitIdentity(event)}>
          {isSetup && (
            <>
              <label className="field">
                <span className="label">姓名（必填）</span>
                <input name="name" className="input" autoComplete="name" required maxLength={200} disabled={busy} />
              </label>
              <label className="field">
                <span className="label">公司名（不存在时将创建公司）</span>
                <input name="companyName" className="input" maxLength={200} disabled={busy} />
              </label>
              <label className="field">
                <span className="label">部门</span>
                <input name="department" className="input" maxLength={200} disabled={busy} />
              </label>
            </>
          )}
          <label className="field">
            <span className="label">邮箱（必填）</span>
            <input
              name="email"
              type="email"
              className="input"
              autoComplete={isSetup ? 'email' : 'email'}
              required
              maxLength={320}
              disabled={busy}
            />
          </label>
          <label className="field">
            <span className="label">密码（{isSetup ? '至少 12 位' : '必填'}）</span>
            <input
              name="password"
              type="password"
              className="input"
              autoComplete={isSetup ? 'new-password' : 'current-password'}
              required
              minLength={isSetup ? 12 : 1}
              disabled={busy}
            />
          </label>
          <ErrorText error={error} />
          <button type="submit" className="btn" disabled={busy}>
            {busy ? '处理中…' : isSetup ? '创建账户' : '登录'}
          </button>
        </form>
      </AuthShell>
    )
  }

  if (state === 'change-password' && user) {
    return (
      <AuthShell>
        <h1 className="text-lg font-semibold text-slate-800">更改临时密码</h1>
        <p className="mt-1 text-sm text-slate-500">首次登录请先设置新密码后继续使用。</p>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void changePassword(event)}>
          <label className="field">
            <span className="label">新密码（至少 12 位）</span>
            <input
              name="password"
              type="password"
              className="input"
              autoComplete="new-password"
              minLength={12}
              required
              disabled={busy}
            />
          </label>
          <ErrorText error={error} />
          <button type="submit" className="btn" disabled={busy}>
            {busy ? '处理中…' : '更新密码'}
          </button>
        </form>
      </AuthShell>
    )
  }

  if (state === 'ready' && user) {
    return (
      <BrowserRouter>
        <SessionContext.Provider value={{ user }}>
          <Routes>
            <Route element={<AppShell onSignOut={() => void signOut()} />}>
              <Route index element={<WorkbenchPage />} />
              <Route path="my-tickets" element={<MyTicketsPage />} />
              <Route path="stats" element={<StatsPage />} />
              <Route path="groups" element={<GroupsPage />} />
              <Route path="rules" element={<RulesPage />} />
              <Route path="logs" element={<LogsPage />} />
              <Route path="outbox" element={<OutboxPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="*" element={<WorkbenchPage />} />
            </Route>
          </Routes>
        </SessionContext.Provider>
      </BrowserRouter>
    )
  }

  return null
}
