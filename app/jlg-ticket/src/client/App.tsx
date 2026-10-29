import { useState } from 'react'
import TicketWorkbench from './pages/TicketWorkbench'
import OrganizationManagement from './pages/OrganizationManagement'
import AssignmentRules from './pages/AssignmentRules'

type View = 'workbench' | 'organization' | 'rules'

const NAV_ITEMS: { key: View; label: string }[] = [
  { key: 'workbench', label: '工单工作台' },
  { key: 'organization', label: '组织管理' },
  { key: 'rules', label: '分配规则' },
]

export default function App() {
  const [view, setView] = useState<View>('workbench')

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      {/* Sidebar */}
      <nav className="w-56 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-200">
          <h1 className="text-base font-bold text-indigo-600">工单管理系统</h1>
        </div>
        <div className="flex-1 py-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                view === item.key
                  ? 'bg-indigo-50 text-indigo-600 border-r-2 border-indigo-500'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>
      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {view === 'workbench' && <TicketWorkbench />}
        {view === 'organization' && <OrganizationManagement />}
        {view === 'rules' && <AssignmentRules />}
      </main>
    </div>
  )
}
