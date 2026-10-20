// 应用入口：会话引导（Token → /api/auth/me）、登录页与登录后的路由壳。
// 路由：工作台（handler/ops）、我的工单（全部角色）、统计/审计（handler/ops）、管理（ops）。

import { useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { fetchCurrentUser, logout as apiLogout } from './api'
import { setUnauthorizedHandler } from './platform/api-client'
import type { CurrentUser, Role } from './contracts'
import AppShell from './components/AppShell'
import LoginScreen from './components/LoginScreen'
import { EmptyBlock } from './components/ui'
import AdminPage from './pages/AdminPage'
import AuditPage from './pages/AuditPage'
import MyTicketsPage from './pages/MyTicketsPage'
import StatsPage from './pages/StatsPage'
import WorkbenchPage from './pages/WorkbenchPage'
import { AuthProvider, useAuth } from './state/auth'
import { CompanyDirectoryProvider } from './state/company-directory'

type Phase = 'checking' | 'login' | 'ready'

export default function App() {
  const [phase, setPhase] = useState<Phase>('checking')
  const [user, setUser] = useState<CurrentUser | null>(null)

  // 已有 Token 时校验会话；失效则清理并回到登录页
  useEffect(() => {
    const token = localStorage.getItem('platform-token')
    if (!token) {
      setPhase('login')
      return
    }
    let cancelled = false
    fetchCurrentUser()
      .then((currentUser) => {
        if (cancelled) return
        setUser(currentUser)
        setPhase('ready')
      })
      .catch(() => {
        if (cancelled) return
        localStorage.removeItem('platform-token')
        setPhase('login')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 携带 Token 的请求返回 401 时统一回到登录页
  useEffect(() => {
    setUnauthorizedHandler(() => {
      localStorage.removeItem('platform-token')
      setUser(null)
      setPhase('login')
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  const handleLogout = () => {
    void apiLogout().catch(() => undefined)
    localStorage.removeItem('platform-token')
    setUser(null)
    setPhase('login')
  }

  if (phase === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">加载中…</p>
      </main>
    )
  }

  if (phase === 'login' || !user) {
    return (
      <LoginScreen
        onSuccess={(currentUser) => {
          setUser(currentUser)
          setPhase('ready')
        }}
      />
    )
  }

  return (
    <AuthProvider user={user} logout={handleLogout}>
      <CompanyDirectoryProvider user={user}>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomeRedirect />} />
              <Route
                path="/workbench"
                element={
                  <RequireRole allow={['handler', 'ops']}>
                    <WorkbenchPage />
                  </RequireRole>
                }
              />
              <Route path="/my-tickets" element={<MyTicketsPage />} />
              <Route
                path="/stats"
                element={
                  <RequireRole allow={['handler', 'ops']}>
                    <StatsPage />
                  </RequireRole>
                }
              />
              <Route
                path="/audit"
                element={
                  <RequireRole allow={['handler', 'ops']}>
                    <AuditPage />
                  </RequireRole>
                }
              />
              <Route
                path="/admin"
                element={
                  <RequireRole allow={['ops']}>
                    <AdminPage />
                  </RequireRole>
                }
              />
              <Route
                path="*"
                element={
                  <section className="card">
                    <EmptyBlock title="页面不存在" hint="请从左侧导航选择目标页面" />
                  </section>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </CompanyDirectoryProvider>
    </AuthProvider>
  )
}

// 角色路由守卫：仅控制入口可见性；数据域与操作权限仍由服务端强制校验。
function RequireRole({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { user } = useAuth()
  if (!allow.includes(user.role)) {
    return (
      <section className="card">
        <EmptyBlock title="当前角色无权访问此页面" hint="如需访问请联系运营管理员调整角色" />
      </section>
    )
  }
  return <>{children}</>
}

function HomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={user.role === 'submitter' ? '/my-tickets' : '/workbench'} replace />
}
