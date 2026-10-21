import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { AuthUser } from '../contract'

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const navItems: { to: string; label: string; icon: ReactNode }[] = [
  { to: '/workbench', label: '工单工作台', icon: <NavIcon><path d="M4 6h16M4 12h16M4 18h10" /></NavIcon> },
  { to: '/mine', label: '我的工单', icon: <NavIcon><path d="M5 4h14v16H5z" /><path d="M5 13h4l1.5 2h3l1.5-2h4" /></NavIcon> },
  {
    to: '/assignment',
    label: '分配配置',
    icon: (
      <NavIcon>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19c.6-3.1 2.7-5 5.5-5s4.9 1.9 5.5 5" />
        <circle cx="16.5" cy="9" r="2.4" />
        <path d="M16.5 14.5c2.3 0 3.8 1.8 4.3 4.5" />
      </NavIcon>
    ),
  },
  { to: '/stats', label: '统计分析', icon: <NavIcon><path d="M5 20v-6M11 20V8M17 20v-10" /><path d="M3 20h18" /></NavIcon> },
  { to: '/logs', label: '操作日志', icon: <NavIcon><path d="M7 3h7l4 4v14H7z" /><path d="M13 3v5h5" /><path d="M10 13h5M10 17h5" /></NavIcon> },
]

export function AppShell(props: { user: AuthUser; onSignOut: () => void; children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-14 items-center gap-2.5 border-b border-slate-100 px-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-semibold text-white">工</div>
          <span className="text-sm font-semibold text-slate-900">工单系统</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-end gap-4 border-b border-slate-200 bg-white px-6">
          <div className="text-right">
            <p className="text-sm font-medium text-slate-800">{props.user.displayName}</p>
            <p className="text-xs text-slate-500">
              {props.user.companyName}
              {props.user.departmentName !== null ? ` · ${props.user.departmentName}` : ''}
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={props.onSignOut}>退出登录</button>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{props.children}</main>
      </div>
    </div>
  )
}
