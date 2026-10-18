import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { ApiRequestError, apiRequest, errorText, setApiHandlers } from './platform/api-client'
import { PermissionProvider, useCan } from './platform/permissions'
import type { CurrentUser, LoginResponse } from './types'
import LedgerPage from './pages/LedgerPage'
import ParcelWorkspace from './pages/ParcelWorkspace'
import AssessmentsPage from './pages/AssessmentsPage'
import AdminPage from './pages/AdminPage'

type Phase = 'checking' | 'required' | 'login' | 'password' | 'ready'

/**
 * 认证与会话壳：
 * - login 响应不含 passwordChangeRequired（服务端 responseTransform 形状），
 *   临时密码检测靠探测请求的 403 PASSWORD_CHANGE_REQUIRED（auth 中间件仅放行 /api/auth/me 与 /api/auth/password）。
 * - 401 且请求携带 token 时全局回登录页（登录失败自身的 401 不重置会话）。
 */
export default function App() {
  const [phase, setPhase] = useState<Phase>('checking')
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [fatal, setFatal] = useState('')

  const probe = useCallback(async (): Promise<'ready' | 'password'> => {
    try {
      await apiRequest('/api/parcels?pageSize=1')
    } catch (cause) {
      if (cause instanceof ApiRequestError) {
        if (cause.code === 'PASSWORD_CHANGE_REQUIRED') return 'password'
        if (cause.status === 401) throw cause
        // 403 FORBIDDEN 等业务权限拒绝：会话有效，导航按 permissions 过滤。
      }
    }
    return 'ready'
  }, [])

  const enterSession = useCallback(async () => {
    const me = await apiRequest<CurrentUser>('/api/auth/me')
    setUser(me)
    setPhase((await probe()) === 'password' ? 'password' : 'ready')
  }, [probe])

  useEffect(() => {
    setApiHandlers({
      onUnauthorized: () => {
        localStorage.removeItem('platform-token')
        setUser(null)
        setPhase('login')
        setError('登录状态已失效，请重新登录')
      },
      onPasswordChangeRequired: () => setPhase('password'),
    })
    void (async () => {
      try {
        if (localStorage.getItem('platform-token')) {
          await enterSession()
          return
        }
        const status = await apiRequest<{ required: boolean }>('/api/auth/bootstrap-status')
        setPhase(status.required ? 'required' : 'login')
      } catch (cause) {
        setFatal(errorText(cause))
      }
    })()
  }, [enterSession])

  const submitIdentity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      if (phase === 'required') {
        await apiRequest('/api/auth/bootstrap-admin', { method: 'POST', body: JSON.stringify(body) })
        setPhase('login')
        setNotice('管理员已创建，请使用该邮箱登录。')
      } else {
        const result = await apiRequest<LoginResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) })
        localStorage.setItem('platform-token', result.token)
        await enterSession()
      }
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await apiRequest('/api/auth/password', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())) })
      await enterSession()
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' })
    } catch {
      // 登出请求失败不阻断本地会话清理
    }
    localStorage.removeItem('platform-token')
    setUser(null)
    setPhase('login')
  }

  if (fatal) {
    return (
      <main className="shell auth-shell">
        <section className="card auth-card">
          <h1 className="auth-brand">Land 拿地决策平台</h1>
          <p role="alert" className="error">{fatal}</p>
          <button onClick={() => window.location.reload()}>重试</button>
        </section>
      </main>
    )
  }

  if (phase === 'checking') return <main className="shell auth-shell"><p className="busy">加载中…</p></main>

  if (phase === 'required' || phase === 'login') {
    return (
      <main className="shell auth-shell">
        <section className="card auth-card">
          <h1 className="auth-brand">Land 拿地决策平台</h1>
          <h2>{phase === 'required' ? '创建首位管理员' : '登录'}</h2>
          <p className="hint">
            {phase === 'required' ? '系统尚无用户，仅可执行一次初始化。' : '使用本地账户（邮箱 + 密码）登录。'}
          </p>
          <form className="stack" onSubmit={(event) => void submitIdentity(event)}>
            {phase === 'required' && <label>姓名<input name="name" autoComplete="name" required maxLength={200} /></label>}
            <label>邮箱（用户名）<input name="username" type="email" autoComplete="email" required maxLength={320} /></label>
            <label>密码<input name="password" type="password" autoComplete={phase === 'required' ? 'new-password' : 'current-password'} required minLength={phase === 'required' ? 12 : 1} /></label>
            {phase === 'required' && <p className="hint">密码至少 12 位。</p>}
            {notice && <p role="status" className="success">{notice}</p>}
            {error && <p role="alert" className="error">{error}</p>}
            <button disabled={busy}>{busy ? '处理中…' : phase === 'required' ? '创建管理员' : '登录'}</button>
          </form>
        </section>
      </main>
    )
  }

  if (phase === 'password' && user) {
    return (
      <main className="shell auth-shell">
        <section className="card auth-card">
          <h1 className="auth-brand">Land 拿地决策平台</h1>
          <h2>更改临时密码</h2>
          <p className="hint">当前使用临时密码，设置新密码后才能继续使用（{user.displayName}）。</p>
          <form className="stack" onSubmit={(event) => void changePassword(event)}>
            <label>新密码（至少 12 位）<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
            {error && <p role="alert" className="error">{error}</p>}
            <button disabled={busy}>更新密码</button>
            <button type="button" className="secondary" onClick={() => void logout()}>退出登录</button>
          </form>
        </section>
      </main>
    )
  }

  if (phase !== 'ready' || !user) return null

  return (
    <PermissionProvider permissions={user.permissions ?? []}>
      <BrowserRouter>
        <div className="app-shell">
          <AppSidebar user={user} logout={() => void logout()} />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<LedgerPage />} />
              <Route path="/parcels/:parcelId" element={<ParcelWorkspace />} />
              <Route path="/parcels/:parcelId/:tab" element={<ParcelWorkspace />} />
              <Route path="/assessments" element={<AssessmentsPage />} />
              <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
              <Route path="/admin/:tab" element={<AdminPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </PermissionProvider>
  )
}

function AppSidebar({ user, logout }: { user: CurrentUser; logout: () => void }) {
  const can = useCan()
  const showAdmin = can('users:manage') || can('roles:manage') || can('parameters:manage')
  const navClass = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? ' active' : ''}`
  return (
    <aside className="sidebar">
      <div className="brand">
        Land 拿地决策平台
        <small>从发现地块到决策交接</small>
      </div>
      <nav className="nav-group">
        <div className="nav-group-title">业务</div>
        {can('parcels:read') && <NavLink to="/" end className={navClass}>地块台账</NavLink>}
        {can('parcels:read') && <NavLink to="/assessments" className={navClass}>快速评估组合</NavLink>}
        {showAdmin && (
          <>
            <div className="nav-group-title">管理</div>
            <NavLink to="/admin/users" className={navClass}>管理后台</NavLink>
          </>
        )}
      </nav>
      <div className="sidebar-footer">
        <span title={user.username}>{user.displayName}</span>
        <span className="muted">{user.roles.join(' / ') || '无角色'}</span>
        <button onClick={logout}>退出登录</button>
      </div>
    </aside>
  )
}
