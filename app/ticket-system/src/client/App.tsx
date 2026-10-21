import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { SessionProvider, useSession } from './app/session'
import { AppShell } from './components/AppShell'
import LoginPage from './pages/LoginPage'
import WorkbenchPage from './pages/WorkbenchPage'
import MyTicketsPage from './pages/MyTicketsPage'
import AssignmentPage from './pages/AssignmentPage'
import StatsPage from './pages/StatsPage'
import LogsPage from './pages/LogsPage'

export default function App() {
  return (
    <SessionProvider>
      <AppRoutes />
    </SessionProvider>
  )
}

function AppRoutes() {
  const session = useSession()
  if (session.status === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-pulse rounded-full bg-indigo-200" />
          <p className="mt-3 text-sm text-slate-500">正在恢复会话…</p>
        </div>
      </div>
    )
  }
  if (session.status === 'anonymous' || session.user === null) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }
  return (
    <AppShell user={session.user} onSignOut={() => { void session.signOut() }}>
      <Routes>
        <Route path="/" element={<Navigate to="/workbench" replace />} />
        <Route path="/login" element={<Navigate to="/workbench" replace />} />
        <Route path="/workbench" element={<WorkbenchPage />} />
        <Route path="/workbench/:ticketId" element={<WorkbenchPage />} />
        <Route path="/mine" element={<MyTicketsPage />} />
        <Route path="/mine/:ticketId" element={<MyTicketsPage />} />
        <Route path="/assignment" element={<AssignmentPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  )
}

function NotFound() {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-base font-semibold text-slate-800">页面不存在</h1>
      <p className="mt-1 text-sm text-slate-500">访问的页面没有找到。</p>
      <Link className="btn-secondary mt-4 inline-flex" to="/workbench">返回工单工作台</Link>
    </div>
  )
}
