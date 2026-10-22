import { Routes, Route, Navigate } from 'react-router-dom'
import { SessionProvider, useSession } from './hooks/useSession'
import Layout from './components/Layout'
import Workbench from './pages/Workbench'
import TicketList from './pages/TicketList'
import TicketForm from './pages/TicketForm'
import Config from './pages/Config'
import StatsDashboard from './pages/StatsDashboard'
import Notifications from './pages/Notifications'

function AppRoutes() {
  const { session, loading } = useSession()

  if (loading) return null
  if (!session?.user) return <Layout />

  return (
    <Routes>
      <Route path="/workbench" element={<Workbench />} />
      <Route path="/tickets" element={<TicketList />} />
      <Route path="/tickets/:id" element={<TicketList />} />
      <Route path="/tickets/new" element={<TicketForm />} />
      <Route path="/config" element={<Config />} />
      <Route path="/stats" element={<StatsDashboard />} />
      <Route path="/notifications" element={<Notifications />} />
      <Route path="*" element={<Navigate to="/workbench" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <SessionProvider>
      <Layout>
        <AppRoutes />
      </Layout>
    </SessionProvider>
  )
}
