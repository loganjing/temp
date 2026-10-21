// 应用壳：认证引导、按角色渲染的左侧导航、顶部上下文栏与页面路由。
// 前端只按角色渲染；角色/公司数据域过滤全部由服务端承担（AC-03 由服务端隔离）。
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { clearToken, fetchMe, logout, readToken } from './api/auth'
import { onUnauthorized } from './platform/api-client'
import { isRole, type CurrentUser, type Role } from './contracts/types'
import { roleLabel } from './contracts/labels'
import { LoginPage } from './pages/LoginPage'
import { MyTicketsPage } from './pages/MyTicketsPage'
import { WorkbenchPage } from './pages/WorkbenchPage'
import { TicketDetailPage } from './pages/TicketDetailPage'
import { AssignConfigPage } from './pages/AssignConfigPage'
import { StatsPage } from './pages/StatsPage'
import UsersPage from './admin/UsersPage'
import {
  IconBarChart3,
  IconClipboardList,
  IconInbox,
  IconLogOut,
  IconSlidersHorizontal,
  IconTicket,
  IconUsers,
  IconShieldAlert,
  IconAlertCircle,
} from './components/icons'
import { Spinner } from './components/ui'

interface AuthContextValue {
  user: CurrentUser
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthContext')
  return value
}

interface NavItem {
  to: string
  label: string
  icon: (props: { className?: string }) => ReactNode
}

const roleNavItems: Record<Role, NavItem[]> = {
  submitter: [{ to: '/my-tickets', label: '我的工单', icon: IconClipboardList }],
  agent: [{ to: '/workbench', label: '工作台', icon: IconInbox }],
  admin: [
    { to: '/assign-config', label: '分配配置', icon: IconSlidersHorizontal },
    { to: '/stats', label: '统计分析', icon: IconBarChart3 },
    { to: '/users', label: '用户管理', icon: IconUsers },
  ],
  viewer: [{ to: '/stats', label: '统计分析', icon: IconBarChart3 }],
}

const defaultRoute: Record<Role, string> = {
  submitter: '/my-tickets',
  agent: '/workbench',
  admin: '/assign-config',
  viewer: '/stats',
}

const routeTitles: { prefix: string; title: string }[] = [
  { prefix: '/my-tickets', title: '我的工单' },
  { prefix: '/workbench', title: '工作台' },
  { prefix: '/tickets/', title: '工单详情' },
  { prefix: '/assign-config', title: '分配配置' },
  { prefix: '/stats', title: '统计分析' },
  { prefix: '/users', title: '用户管理' },
]

type Phase = 'boot' | 'anon' | 'ready' | 'unprofiled'

export default function App() {
  const [phase, setPhase] = useState<Phase>('boot')
  const [user, setUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    onUnauthorized(() => {
      clearToken()
      setUser(null)
      setPhase('anon')
    })
  }, [])

  useEffect(() => {
    const token = readToken()
    if (!token) {
      setPhase('anon')
      return
    }
    fetchMe().then(
      (me) => {
        setUser(me)
        setPhase(isRole(me.role) ? 'ready' : 'unprofiled')
      },
      () => {
        clearToken()
        setPhase('anon')
      },
    )
  }, [])

  const handleLoggedIn = (me: CurrentUser) => {
    setUser(me)
    setPhase(isRole(me.role) ? 'ready' : 'unprofiled')
  }

  const handleLogout = () => {
    void logout().catch(() => undefined)
    clearToken()
    setUser(null)
    setPhase('anon')
  }

  if (phase === 'boot') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
        <span className="flex items-center gap-2 text-sm">
          <Spinner className="size-4" />
          正在加载…
        </span>
      </div>
    )
  }

  if (phase === 'anon') return <LoginPage onLoggedIn={handleLoggedIn} />

  if (phase === 'unprofiled' || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-blue-600 text-2xl text-white">
            <IconTicket />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">账号未配置业务角色</h1>
          <p className="text-sm text-slate-500">
            当前账号尚未分配业务角色，请联系配置管理员在「用户管理」中完善业务档案后重新登录。
          </p>
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            onClick={handleLogout}
          >
            <IconLogOut className="size-4" />
            退出登录
          </button>
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ user, logout: handleLogout }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route element={<AppShell />}>
            <Route index element={<HomeRedirect />} />
            <Route
              path="/my-tickets"
              element={
                <RoleRoute roles={['submitter']}>
                  <MyTicketsPage />
                </RoleRoute>
              }
            />
            <Route
              path="/workbench"
              element={
                <RoleRoute roles={['agent']}>
                  <WorkbenchPage />
                </RoleRoute>
              }
            />
            <Route
              path="/workbench/:ticketId"
              element={
                <RoleRoute roles={['agent']}>
                  <WorkbenchPage />
                </RoleRoute>
              }
            />
            <Route path="/tickets/:ticketId" element={<TicketDetailPage />} />
            <Route
              path="/assign-config"
              element={
                <RoleRoute roles={['admin']}>
                  <AssignConfigPage />
                </RoleRoute>
              }
            />
            <Route
              path="/stats"
              element={
                <RoleRoute roles={['admin', 'viewer']}>
                  <StatsPage />
                </RoleRoute>
              }
            />
            <Route
              path="/users"
              element={
                <RoleRoute roles={['admin']}>
                  <UsersPage />
                </RoleRoute>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}

function HomeRedirect() {
  const { user } = useAuth()
  const target = isRole(user.role) ? defaultRoute[user.role] : '/stats'
  return <Navigate to={target} replace />
}

function RoleRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth()
  if (isRole(user.role) && roles.includes(user.role)) return <>{children}</>
  return <ForbiddenPage />
}

function currentRouteTitle(pathname: string): string {
  return routeTitles.find((route) => pathname.startsWith(route.prefix))?.title ?? '工单系统'
}

function AppShell() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const items = isRole(user.role) ? roleNavItems[user.role] : []

  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-100 px-5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-blue-600 text-base text-white">
            <IconTicket />
          </span>
          <span className="text-base font-semibold text-slate-900">工单系统</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="主导航">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <item.icon />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-700"
          >
            <IconLogOut />
            退出
          </button>
        </div>
      </aside>

      <div className="pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-8 backdrop-blur">
          <h1 className="text-sm font-semibold text-slate-900">{currentRouteTitle(location.pathname)}</h1>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium text-slate-800" title={user.username}>
              {user.displayName}
            </span>
            <span className="text-slate-300" aria-hidden>
              |
            </span>
            <span className="text-slate-500" title={user.companyName ?? undefined}>
              {user.companyName ?? '未配置公司'}
            </span>
            <span className="text-slate-300" aria-hidden>
              |
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {roleLabel(user.role)}
            </span>
          </div>
        </header>
        <main className="px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
      <IconShieldAlert className="size-10 text-slate-400" />
      <h2 className="text-lg font-semibold text-slate-900">403 · 无权限访问</h2>
      <p className="max-w-sm text-sm text-slate-500">
        当前角色无权访问此页面。如需相应权限，请联系配置管理员调整账号角色。
      </p>
      <NavigateHomeButton />
    </div>
  )
}

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
      <IconAlertCircle className="size-10 text-slate-400" />
      <h2 className="text-lg font-semibold text-slate-900">404 · 页面不存在</h2>
      <p className="max-w-sm text-sm text-slate-500">访问的页面不存在或已被移除。</p>
      <NavigateHomeButton />
    </div>
  )
}

function NavigateHomeButton() {
  return (
    <button
      type="button"
      className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
      onClick={() => {
        window.location.href = '/'
      }}
    >
      返回首页
    </button>
  )
}
