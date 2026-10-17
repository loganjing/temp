import { NavLink, Outlet } from 'react-router-dom'
import { useApp } from './app-context'

const navItems = [
  { to: '/', label: '工单工作台' },
  { to: '/groups', label: '业务组管理' },
  { to: '/rules', label: '自动分配规则' },
  { to: '/users', label: '用户目录' },
]

export default function App() {
  const {
    companies, currentUsers, companyId, setCompanyId, operatorId, setOperatorId, loading, error,
  } = useApp()

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3 text-base font-semibold">工单管理系统</div>
        <nav className="flex flex-col gap-1 p-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            公司
            <select
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              value={companyId ?? ''}
              onChange={(event) => setCompanyId(event.target.value)}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            当前身份
            <select
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              value={operatorId ?? ''}
              onChange={(event) => setOperatorId(event.target.value)}
            >
              {currentUsers.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </label>
          {loading && <span className="text-xs text-slate-400">加载中…</span>}
          {error && <span className="text-xs text-rose-600">{error}</span>}
        </header>

        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
