import { createContext, useContext } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import type { CurrentUser } from '../types'

export type Session = { user: CurrentUser }

export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('SessionContext 缺失')
  return session
}

const NAV_ITEMS: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: '工单工作台', end: true },
  { to: '/my-tickets', label: '我的工单' },
  { to: '/stats', label: '统计分析' },
  { to: '/groups', label: '业务组配置' },
  { to: '/rules', label: '分配规则' },
  { to: '/logs', label: '操作日志' },
  { to: '/outbox', label: '发件箱' },
]

const NAV_CLASS = ({ isActive }: { isActive: boolean }) =>
  `block rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
  }`

/** 应用壳：左侧导航 + 顶部上下文栏（当前用户姓名/公司/部门、退出登录）+ 主工作区。 */
export function AppShell({ onSignOut }: { onSignOut: () => void }) {
  const { user } = useSession()
  return (
    <div className="flex min-h-screen">
      <nav className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-lg font-semibold text-slate-800">工单系统</p>
          <p className="mt-0.5 text-xs text-slate-400">工单提交 · 分配 · 处理闭环</p>
        </div>
        <div className="flex-1 space-y-0.5 px-3 py-3">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={NAV_CLASS}>
              {item.label}
            </NavLink>
          ))}
          <p className="px-3 pb-1 pt-4 text-xs font-medium text-slate-400">管理</p>
          <NavLink to="/users" className={NAV_CLASS}>
            用户管理
          </NavLink>
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">{user.name}</span>
            <span className="text-slate-300"> · </span>
            <span title={user.email}>{user.companyName || '未填写公司'}</span>
            <span className="text-slate-300"> · </span>
            <span>{user.department || '未填写部门'}</span>
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={onSignOut}>
            退出登录
          </button>
        </header>
        <main className="min-w-0 flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
