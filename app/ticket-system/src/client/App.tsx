import { useCallback, useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { fetchCurrentUser, logout as apiLogout } from './api'
import UsersPage from './admin/UsersPage'
import { RoleBadge, ToastProvider } from './components/ui'
import LoginPage from './pages/LoginPage'
import WorkbenchPage from './pages/WorkbenchPage'
import MyTicketsPage from './pages/MyTicketsPage'
import StatsPage from './pages/StatsPage'
import AdminPage from './pages/AdminPage'
import NotificationsPage from './pages/NotificationsPage'
import { SessionContext, useSession, type Session } from './session'
import type { UserProfileSummary } from './types'

type BootstrapState = 'checking' | 'login' | 'ready'

export default function App() {
  const [state, setState] = useState<BootstrapState>('checking')
  const [user, setUser] = useState<UserProfileSummary | null>(null)

  const refresh = useCallback(async () => {
    try {
      const profile = await fetchCurrentUser()
      setUser(profile)
      setState('ready')
      return true
    } catch {
      setUser(null)
      setState('login')
      return false
    }
  }, [])

  const signOut = useCallback(async () => {
    await apiLogout()
    setUser(null)
    setState('login')
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const session = useMemo<Session | null>(() => {
    if (!user) return null
    return { user, refresh, signOut }
  }, [user, refresh, signOut])

  if (state === 'checking') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <p className="text-sm text-slate-500">加载中…</p>
      </main>
    )
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <SessionContext.Provider value={session}>
          <Routes>
            <Route
              path="/login"
              element={user ? <Navigate to="/" replace /> : <LoginPage onSuccess={() => void refresh()} />}
            />
            <Route path="/" element={user ? <AppShell /> : <Navigate to="/login" replace />}>
              <Route index element={<Navigate to="/workbench" replace />} />
              <Route path="workbench" element={<WorkbenchPage />} />
              <Route path="my-tickets" element={<MyTicketsPage />} />
              <Route path="stats" element={<StatsPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route
                path="users"
                element={
                  <div className="starter-scope min-h-0 flex-1 overflow-y-auto p-6">
                    <UsersPage />
                  </div>
                }
              />
              <Route path="*" element={<Navigate to="/workbench" replace />} />
            </Route>
          </Routes>
        </SessionContext.Provider>
      </BrowserRouter>
    </ToastProvider>
  )
}

const pageTitles: Record<string, string> = {
  '/workbench': '工作台',
  '/my-tickets': '我的工单',
  '/stats': '统计分析',
  '/admin': '管理',
  '/notifications': '我的通知',
  '/users': '用户管理 · 账户引导',
}

function AppShell() {
  const { user, signOut } = useSession()
  const location = useLocation()

  const navItems = [
    { to: '/workbench', label: '工作台' },
    { to: '/my-tickets', label: '我的工单' },
    { to: '/stats', label: '统计' },
    ...(user.role === 'company_admin' ? [{ to: '/admin', label: '管理' }] : []),
    { to: '/notifications', label: '我的通知' },
  ]

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-slate-100 px-5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-sm font-bold text-white">工</div>
          <span className="text-sm font-semibold">工单系统</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-50 font-medium text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <div className="my-3 border-t border-slate-100" />
          <NavLink
            to="/users"
            className={({ isActive }) =>
              `flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-blue-50 font-medium text-blue-700'
                  : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
              }`
            }
            title="账户与凭证引导（基础用户管理）"
          >
            用户管理
          </NavLink>
        </nav>
        <p className="border-t border-slate-100 px-5 py-3 text-[11px] leading-relaxed text-slate-400">
          工单数据按公司隔离
          <br />
          桌面 Web · ≥1280px
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <h1 className="text-sm font-medium text-slate-700">{pageTitles[location.pathname] ?? '工单系统'}</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600" title={user.email}>
              {user.displayName}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {user.companyName}
            </span>
            <RoleBadge role={user.role} />
            <button type="button" className="btn btn-secondary h-8 px-3 text-xs" onClick={() => void signOut()}>
              退出登录
            </button>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
