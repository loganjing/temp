import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost, apiDelete } from '../platform/api-client'
import {
  type CategoriesResponse,
  type RulesResponse,
  type CompaniesResponse,
  type GroupsResponse,
  type Category,
  type CategoryGroupRule,
  type Company,
  type BusinessGroup,
} from '../platform/types'
import {
  SectionTitle,
  ErrorBanner,
  EmptyState,
  Spinner,
  useToast,
} from '../components/ui'
import { PlusIcon, TrashIcon } from '../components/icons'

export default function CategoryRulePage() {
  const { showToast } = useToast()

  const [categories, setCategories] = useState<Category[]>([])
  const [rules, setRules] = useState<CategoryGroupRule[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newCategoryName, setNewCategoryName] = useState('')
  const [filterCompanyId, setFilterCompanyId] = useState('')

  // rule form
  const [ruleCompanyId, setRuleCompanyId] = useState('')
  const [ruleCategoryId, setRuleCategoryId] = useState('')
  const [ruleGroupId, setRuleGroupId] = useState('')

  const [submitting, setSubmitting] = useState(false)

  const fetchCategories = useCallback(async () => {
    try {
      const data = await apiGet<CategoriesResponse>('/api/categories')
      setCategories(data.categories ?? [])
    } catch {
      setCategories([])
    }
  }, [])

  const fetchCompanies = useCallback(async () => {
    try {
      const data = await apiGet<CompaniesResponse>('/api/companies')
      setCompanies(data.companies ?? [])
    } catch {
      setCompanies([])
    }
  }, [])

  const fetchRules = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string | number | undefined | null> = {}
      if (filterCompanyId) params.companyId = filterCompanyId
      const data = await apiGet<RulesResponse>('/api/category-group-rules', params)
      setRules(data.rules ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载规则列表失败')
    } finally {
      setLoading(false)
    }
  }, [filterCompanyId])

  const fetchGroupsForCompany = useCallback(async () => {
    if (!ruleCompanyId) {
      setGroups([])
      return
    }
    try {
      const data = await apiGet<GroupsResponse>(
        `/api/companies/${ruleCompanyId}/business-groups`,
      )
      setGroups(data.groups ?? [])
    } catch {
      setGroups([])
    }
  }, [ruleCompanyId])

  useEffect(() => {
    fetchCategories()
    fetchCompanies()
  }, [fetchCategories, fetchCompanies])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  useEffect(() => {
    fetchGroupsForCompany()
  }, [fetchGroupsForCompany])

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return
    setSubmitting(true)
    try {
      await apiPost('/api/categories', { name: newCategoryName.trim() })
      showToast('分类已创建')
      setNewCategoryName('')
      fetchCategories()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '创建分类失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateRule = async () => {
    if (!ruleCompanyId || !ruleCategoryId || !ruleGroupId) return
    setSubmitting(true)
    try {
      await apiPost('/api/category-group-rules', {
        companyId: Number(ruleCompanyId),
        categoryId: Number(ruleCategoryId),
        groupId: Number(ruleGroupId),
      })
      showToast('规则已创建')
      setRuleCategoryId('')
      setRuleGroupId('')
      fetchRules()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '创建规则失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteRule = async (id: number) => {
    try {
      await apiDelete(`/api/category-group-rules/${id}`)
      showToast('规则已删除')
      fetchRules()
    } catch (e) {
      showToast(e instanceof Error ? e.message : '删除规则失败', 'error')
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Top context bar */}
      <div className="border-b border-gray-200 bg-white px-6 py-3 flex-shrink-0">
        <h1 className="text-lg font-semibold text-gray-800">分类与规则管理</h1>
      </div>

      {loading && categories.length === 0 ? (
        <div className="flex items-center justify-center flex-1">
          <Spinner />
        </div>
      ) : error && categories.length === 0 ? (
        <div className="p-6">
          <ErrorBanner message={error} onRetry={fetchRules} />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: category list */}
          <div className="w-72 border-r border-gray-200 flex flex-col overflow-hidden bg-white flex-shrink-0">
            <div className="p-3 border-b border-gray-200">
              <SectionTitle>问题分类</SectionTitle>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="分类名称"
                  className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5"
                />
                <button
                  onClick={handleCreateCategory}
                  disabled={submitting || !newCategoryName.trim()}
                  className="flex items-center px-2 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  <PlusIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
            <ul className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {categories.length === 0 ? (
                <EmptyState title="暂无分类" description="先创建一个问题分类" />
              ) : (
                categories.map((c) => (
                  <li key={c.id} className="px-4 py-2.5 text-sm text-gray-700">
                    {c.name}
                  </li>
                ))
              )}
            </ul>
          </div>

          {/* Right: rule config */}
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <div className="p-6 space-y-6 max-w-3xl">
              {/* Create rule form */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <SectionTitle>配置映射规则</SectionTitle>
                <p className="text-xs text-gray-400 mb-3">
                  为公司配置"分类 → 业务组"的映射规则，使工单创建时自动分配到对应业务组。
                </p>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">公司</label>
                    <select
                      value={ruleCompanyId}
                      onChange={(e) => {
                        setRuleCompanyId(e.target.value)
                        setRuleGroupId('')
                      }}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white"
                    >
                      <option value="">选择公司</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">分类</label>
                    <select
                      value={ruleCategoryId}
                      onChange={(e) => setRuleCategoryId(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white"
                    >
                      <option value="">选择分类</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">业务组</label>
                    <select
                      value={ruleGroupId}
                      onChange={(e) => setRuleGroupId(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white"
                    >
                      <option value="">选择业务组</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleCreateRule}
                    disabled={submitting || !ruleCompanyId || !ruleCategoryId || !ruleGroupId}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <PlusIcon className="w-4 h-4" />
                    创建规则
                  </button>
                </div>
              </div>

              {/* Rule list */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <SectionTitle>映射规则</SectionTitle>
                  <select
                    value={filterCompanyId}
                    onChange={(e) => setFilterCompanyId(e.target.value)}
                    className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                  >
                    <option value="">全部公司</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                {rules.length === 0 ? (
                  <p className="text-sm text-gray-400">暂无映射规则</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {rules.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between py-2.5 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-gray-700">{r.companyName}</span>
                          <span className="text-gray-400">→</span>
                          <span className="text-gray-600">{r.categoryName}</span>
                          <span className="text-gray-400">→</span>
                          <span className="text-gray-700 font-medium">{r.groupName}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteRule(r.id)}
                          className="text-red-400 hover:text-red-600 p-1"
                          title="删除规则"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
