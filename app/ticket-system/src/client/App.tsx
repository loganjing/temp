import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import LoginPage from './auth/LoginPage'
import AppShell from './components/AppShell'
import TicketWorkspace from './tickets/TicketWorkspace'
import TicketCreatePage from './tickets/TicketCreatePage'
import StatsPage from './stats/StatsPage'
import GroupsPage from './admin/GroupsPage'
import UsersPage from './admin/UsersPage'
import { buttonSecondaryClass } from './components/feedback'

function RequireAuth() {
  const { status } = useAuth()
  if (status === 'checking') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50">
        <p className="text-sm text-slate-500">加载中…</p>
      </main>
    )
  }
  if (status === 'anonymous') return <Navigate to="/login" replace />
  return <AppShell />
}

function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-base font-semibold text-slate-800">资源不存在或无权访问</h1>
        <p className="mt-1 text-sm text-slate-500">请求的页面或资源不存在，或当前账号没有访问权限。</p>
        <Link to="/workbench" className={`${buttonSecondaryClass} mt-4`}>
          返回工单工作台
        </Link>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route index element={<Navigate to="/workbench" replace />} />
            <Route path="/workbench" element={<TicketWorkspace view="workbench" />} />
            <Route path="/mine" element={<TicketWorkspace view="mine" />} />
            <Route path="/tickets/new" element={<TicketCreatePage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
