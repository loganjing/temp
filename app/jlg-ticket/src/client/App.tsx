import { NavLink, Route, Routes, Navigate, Outlet } from 'react-router-dom'
import TicketListPage from './pages/TicketListPage'
import TicketDetail from './pages/TicketDetail'
import CreateTicketPage from './pages/CreateTicketPage'
import BusinessGroupPage from './pages/BusinessGroupPage'
import CategoryRulePage from './pages/CategoryRulePage'
import { TicketIcon, PlusIcon, UsersIcon, TagIcon } from './components/icons'

const NAV_ITEMS = [
  { path: '/tickets', label: '工单列表', Icon: TicketIcon },
  { path: '/create', label: '创建工单', Icon: PlusIcon },
  { path: '/groups', label: '业务组管理', Icon: UsersIcon },
  { path: '/categories', label: '分类与规则管理', Icon: TagIcon },
]

function TicketDetailPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <TicketIcon className="w-12 h-12 text-gray-300 mb-3" />
      <p className="text-sm font-medium text-gray-400">选择左侧工单查看详情</p>
      <p className="text-xs text-gray-300 mt-1">或创建新工单开始处理流程</p>
    </div>
  )
}

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Left navigation */}
      <nav className="w-56 bg-slate-800 text-white flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <TicketIcon className="w-5 h-5 text-blue-400" />
            <span className="text-base font-semibold">工单系统</span>
          </div>
        </div>
        <ul className="flex-1 py-2">
          {NAV_ITEMS.map(({ path, label, Icon }) => (
            <li key={path}>
              <NavLink
                to={path}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-slate-700 text-white border-l-4 border-blue-400 -ml-1'
                      : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main work area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/tickets" replace />} />
          <Route path="/tickets" element={<TicketListPage />}>
            <Route index element={<TicketDetailPlaceholder />} />
            <Route path=":ticketId" element={<TicketDetail />} />
          </Route>
          <Route path="/create" element={<CreateTicketPage />} />
          <Route path="/groups" element={<BusinessGroupPage />} />
          <Route path="/categories" element={<CategoryRulePage />} />
        </Routes>
      </div>
    </div>
  )
}
