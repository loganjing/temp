import { type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useSession } from './platform/session'
import { ROLE_LABELS, labelOf } from './labels'

// 应用壳：左侧导航（「仓储费用管理」一级菜单 + 系统管理）+ 顶部上下文栏 + 主工作区。
// 导航与操作入口按登录会话 permissions 控制可见性。

interface NavItem { to: string; label: string; permission: string }
interface NavGroup { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: '仓储费用管理',
    items: [
      { to: '/quotes', label: '仓储合同报价单', permission: 'quote:view' },
      { to: '/receivables', label: '应收费用明细', permission: 'receivable:view' },
      { to: '/adjustments', label: '应收费用调整单', permission: 'adjustment:view' },
      { to: '/recon-statements', label: '应收对账单', permission: 'recon:view' },
      { to: '/settlements', label: '应收结算单', permission: 'settlement:view' },
      { to: '/reports', label: '报表导出', permission: 'report:export' },
      { to: '/masterdata', label: '基础档案', permission: 'masterdata:maintain' },
    ],
  },
  {
    label: '系统管理',
    items: [
      { to: '/system/users', label: '用户与角色', permission: 'user:manage' },
      { to: '/system/jobs', label: '任务执行记录', permission: 'job:view' },
      { to: '/system/audit', label: '审计查询', permission: 'audit:view' },
    ],
  },
]

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, can, orgName, logout } = useSession()
  const navigate = useNavigate()

  const signOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <div className="app-brand">
          <span className="app-brand-title">KWMS 仓储费用管理</span>
          <span className="app-brand-sub">报价 · 计费 · 对账 · 结算</span>
        </div>
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((item) => can(item.permission))
          if (visibleItems.length === 0) return null
          return (
            <nav className="nav-group" key={group.label} aria-label={group.label}>
              <p className="nav-group-label" style={{ margin: '0 0 4px' }}>{group.label}</p>
              {visibleItems.map((item) => (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )
        })}
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div className="who">
            <span>当前用户：<strong>{user?.name ?? user?.username ?? '—'}</strong></span>
            <span>所属组织：<strong>{orgName(user?.orgId)}</strong></span>
            <span>角色：<strong>{user?.roles.map((role) => labelOf(ROLE_LABELS, role)).join('、') || '—'}</strong></span>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void signOut()}>退出登录</button>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  )
}
