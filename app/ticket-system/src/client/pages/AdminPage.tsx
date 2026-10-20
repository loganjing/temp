// 管理页（仅 ops）：公司、用户档案、业务组与成员、分配规则的维护。
// 公司选择器作用于用户/业务组/分配规则三个区块；公司管理为全局区块。

import { useEffect, useState } from 'react'
import { useAuth } from '../state/auth'
import { useCompanyDirectory } from '../state/company-directory'
import { CompaniesSection, GroupsSection, RulesSection, UsersSection } from '../components/admin/AdminSections'

type Tab = 'users' | 'groups' | 'rules' | 'companies'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'users', label: '用户档案' },
  { id: 'groups', label: '业务组与成员' },
  { id: 'rules', label: '分配规则' },
  { id: 'companies', label: '公司管理' },
]

export default function AdminPage() {
  const { user } = useAuth()
  const { companies } = useCompanyDirectory()
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>('users')

  // 默认选中本公司（若不存在则取第一家）
  useEffect(() => {
    if (companyId != null || companies.length === 0) return
    setCompanyId(companies.some((company) => company.id === user.company_id) ? user.company_id : companies[0].id)
  }, [companies, companyId, user.company_id])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">管理</h1>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500" htmlFor="admin-company">
            当前公司
          </label>
          <select
            id="admin-company"
            className="input w-auto"
            value={companyId ?? ''}
            onChange={(event) => setCompanyId(Number(event.currentTarget.value))}
          >
            {companies.length === 0 && <option value="">暂无公司</option>}
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tab ${tab === item.id ? 'tab-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'companies' && <CompaniesSection />}
      {tab === 'users' && companyId != null && <UsersSection companyId={companyId} />}
      {tab === 'groups' && companyId != null && <GroupsSection companyId={companyId} />}
      {tab === 'rules' && companyId != null && <RulesSection companyId={companyId} />}
    </div>
  )
}
