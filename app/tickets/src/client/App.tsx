import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ToastProvider, ToastContainer } from './hooks/useToast'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { WorkbenchPage } from './pages/WorkbenchPage'
import { AdminPage } from './pages/AdminPage'
import { StatsPage } from './pages/StatsPage'
import { AuditLogPage } from './pages/AuditLogPage'
import type { ReactNode } from 'react'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/workbench" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { user } = useAuth()

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/workbench" replace />} />
      <Route
        path="/workbench"
        element={
          <RequireAuth>
            <AppLayout>
              <WorkbenchPage />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AppLayout>
              <AdminPage />
            </AppLayout>
          </RequireAdmin>
        }
      />
      <Route
        path="/stats"
        element={
          <RequireAdmin>
            <AppLayout>
              <StatsPage />
            </AppLayout>
          </RequireAdmin>
        }
      />
      <Route
        path="/audit-logs"
        element={
          <RequireAdmin>
            <AppLayout>
              <AuditLogPage />
            </AppLayout>
          </RequireAdmin>
        }
      />
      <Route path="/" element={<Navigate to="/workbench" replace />} />
      <Route path="*" element={<Navigate to="/workbench" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <ToastContainer />
      </ToastProvider>
    </AuthProvider>
  )
}
