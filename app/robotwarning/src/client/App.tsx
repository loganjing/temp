import { NavLink, Route, Routes } from 'react-router-dom'
import PatrolRoutes from './pages/PatrolRoutes'
import AlertWorkbench from './pages/AlertWorkbench'
import AuditTrail from './pages/AuditTrail'

const navItems = [
  { to: '/', label: '巡逻路线', end: true },
  { to: '/alerts', label: '告警处置', end: false },
  { to: '/audit', label: '事件留痕', end: false },
]

export default function App() {
  return (
    <div className="flex h-screen bg-slate-50">
      <nav className="w-56 shrink-0 bg-slate-800 text-white p-4 flex flex-col gap-1">
        <h1 className="text-lg font-bold mb-4">机器人巡逻告警</h1>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `block px-3 py-2 rounded text-sm ${isActive ? 'bg-slate-700' : 'text-slate-300 hover:bg-slate-700'}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<PatrolRoutes />} />
          <Route path="/alerts" element={<AlertWorkbench />} />
          <Route path="/audit" element={<AuditTrail />} />
        </Routes>
      </main>
    </div>
  )
}
