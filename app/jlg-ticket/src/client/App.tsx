import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import TicketListPage from './pages/TicketListPage'
import TicketCreatePage from './pages/TicketCreatePage'
import BusinessGroupPage from './pages/BusinessGroupPage'
import AssignmentRulesPage from './pages/AssignmentRulesPage'

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<TicketListPage />} />
            <Route path="/tickets/new" element={<TicketCreatePage />} />
            <Route path="/groups" element={<BusinessGroupPage />} />
            <Route path="/rules" element={<AssignmentRulesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
