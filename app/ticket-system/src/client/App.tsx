import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { Role } from './api/types'
import { AuthProvider, roleHome, useAuth } from './auth/AuthContext'
import { AppLayout } from './components/AppLayout'
import { SkeletonBlock } from './components/ui'
import { ToastProvider } from './components/Toast'
import LoginPage from './pages/LoginPage'
import MyTicketsPage from './pages/MyTicketsPage'
import NotFoundPage from './pages/NotFoundPage'
import SettingsPage from './pages/SettingsPage'
import StatsPage from './pages/StatsPage'
import TicketDetailPage from './pages/TicketDetailPage'
import WorkbenchPage from './pages/WorkbenchPage'

function BootSplash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">工</span>
        <SkeletonBlock className="h-3 w-32" />
      </div>
    </div>
  )
}

function GuardedLayout({ allowed }: { allowed: Role[] }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!allowed.includes(user.role)) return <Navigate to={roleHome(user.role)} replace />
  return <AppLayout />
}

function AppRoutes() {
  const { user, booting } = useAuth()
  if (booting) return <BootSplash />
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={roleHome(user.role)} replace /> : <LoginPage />} />
      <Route path="/" element={<Navigate to={user ? roleHome(user.role) : '/login'} replace />} />
      <Route element={<GuardedLayout allowed={['handler', 'admin']} />}>
        <Route path="/workbench" element={<WorkbenchPage />} />
        <Route path="/stats" element={<StatsPage />} />
      </Route>
      <Route element={<GuardedLayout allowed={['submitter']} />}>
        <Route path="/tickets" element={<MyTicketsPage />} />
      </Route>
      <Route element={<GuardedLayout allowed={['submitter', 'handler', 'admin']} />}>
        <Route path="/tickets/:id" element={<TicketDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route element={<GuardedLayout allowed={['admin']} />}>
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
