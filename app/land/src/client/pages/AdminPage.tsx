import { Link, useParams } from 'react-router-dom'
import { useCan } from '../platform/permissions'
import UsersPage from '../admin/UsersPage'
import RolesPanel from '../components/admin/RolesPanel'
import ParametersPanel from '../components/admin/ParametersPanel'

const TABS: Array<{ key: string; label: string; permission: string }> = [
  { key: 'users', label: '用户管理', permission: 'users:manage' },
  { key: 'roles', label: '角色权限', permission: 'roles:manage' },
  { key: 'parameters', label: '业务参数', permission: 'parameters:manage' },
]

/** 管理后台：用户（复用骨架页）/ 角色权限 / 版本化参数，按权限过滤页签。 */
export default function AdminPage() {
  const can = useCan()
  const { tab = 'users' } = useParams<'tab'>()
  const visibleTabs = TABS.filter((entry) => can(entry.permission))
  const activeTab = visibleTabs.some((entry) => entry.key === tab) ? tab : visibleTabs[0]?.key ?? ''

  return (
    <div className="stack">
      <div className="topbar">
        <h1>管理后台</h1>
        <p className="hint">用户与角色（本地账户体系）、业务参数版本发布。</p>
      </div>

      {visibleTabs.length > 0 && (
        <nav className="tabs">
          {visibleTabs.map((entry) => (
            <Link key={entry.key} className={`tab-link${entry.key === activeTab ? ' active' : ''}`} to={`/admin/${entry.key}`}>
              {entry.label}
            </Link>
          ))}
        </nav>
      )}
      {visibleTabs.length === 0 && <p className="hint">当前账号无任何管理权限。</p>}

      {activeTab === 'users' && <UsersPage />}
      {activeTab === 'roles' && <RolesPanel />}
      {activeTab === 'parameters' && <ParametersPanel />}
    </div>
  )
}
