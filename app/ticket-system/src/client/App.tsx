// 顶层路由与认证门卫：登录页独立，其余页面套应用壳。
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
import { AuthProvider, useAuth } from './auth'
import { AppShell } from './AppShell'
import LoginPage from './LoginPage'
import { TicketBoard } from './TicketBoard'
import { StatsPage } from './StatsPage'
import { ConfigPage } from './ConfigPage'
import UsersPage from './admin/UsersPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}

function AppRoutes() {
  const { phase } = useAuth()
  if (phase === 'checking') return <FullScreenLoading />
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Navigate to="/tickets" replace />} />
        <Route path="/tickets/:ticketId?" element={<TicketBoard mode="tickets" />} />
        <Route path="/workbench/:ticketId?" element={<TicketBoard mode="workbench" />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/config" element={<ConfigPage />} />
        <Route path="/users" element={<UsersPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/tickets" replace />} />
    </Routes>
  )
}

function RequireAuth() {
  const { phase } = useAuth()
  if (phase === 'ready') {
    return (
      <AppShell>
        <Outlet />
      </AppShell>
    )
  }
  return <Navigate to="/login" replace />
}

function FullScreenLoading() {
  return (
    <main className="auth-shell">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        正在检查登录状态…
      </div>
    </main>
  )
}
