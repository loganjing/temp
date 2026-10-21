import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/AuthContext'
import { AppLayout } from './components/layout'
import { ToastProvider } from './components/Toast'
import DashboardPage from './pages/DashboardPage'
import GroupsPage from './pages/GroupsPage'
import LoginPage from './pages/LoginPage'
import MailOutboxPage from './pages/MailOutboxPage'
import RulesPage from './pages/RulesPage'
import TicketListPage from './pages/TicketListPage'

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/workspace" element={<TicketListPage scope="company" />} />
          <Route path="/tickets" element={<TicketListPage scope="mine" />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/mail-outbox" element={<MailOutboxPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/workspace" replace />} />
      </Routes>
    </ToastProvider>
  )
}
