import { useCallback, useEffect, useState } from 'react'
import type { AssignmentRule, BusinessGroup, Category, Company } from '../types'
import { apiGet, apiPost } from '../platform/api-client'
import { ApiRequestError } from '../platform/api-client'
import { LoadingState, EmptyState, ErrorState, FeedbackBanner } from '../components/States'

export default function AssignmentRulesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [rules, setRules] = useState<AssignmentRule[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [categoryId, setCategoryId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 公司 + 分类
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      apiGet<{ items: Company[] }>('/api/companies'),
      apiGet<{ items: Category[] }>('/api/categories'),
    ])
      .then(([c, cat]) => {
        if (cancelled) return
        setCompanies(c.items ?? [])
        setCategories(cat.items ?? [])
        if (c.items?.[0]) setSelectedCompanyId(c.items[0].id)
        if (cat.items?.[0]) setCategoryId(cat.items[0].id)
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : '加载失败'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  // 规则 + 业务组（随公司选择刷新）
  const fetchCompanyData = useCallback(async () => {
    if (!selectedCompanyId) {
      setRules([])
      setGroups([])
      return
    }
    setError(null)
    try {
      const [r, g] = await Promise.all([
        apiGet<{ items: AssignmentRule[] }>(
          `/api/companies/${selectedCompanyId}/assignment-rules`,
        ),
        apiGet<{ items: BusinessGroup[] }>(
          `/api/companies/${selectedCompanyId}/business-groups`,
        ),
      ])
      setRules(r.items ?? [])
      setGroups(g.items ?? [])
      setGroupId((prev) =>
        prev && g.items?.some((x) => x.id === prev) ? prev : g.items?.[0]?.id ?? '',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载规则失败')
    }
  }, [selectedCompanyId])

  useEffect(() => {
    void fetchCompanyData()
  }, [fetchCompanyData])

  const createRule = async () => {
    if (!selectedCompanyId || !categoryId || !groupId) return
    setSubmitting(true)
    setFeedback(null)
    try {
      await apiPost(`/api/companies/${selectedCompanyId}/assignment-rules`, {
        categoryId,
        groupId,
      })
      setFeedback({ type: 'success', message: '规则创建成功' })
      await fetchCompanyData()
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof ApiRequestError ? err.message : err instanceof Error ? err.message : '创建规则失败',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingState label="加载分类规则…" />

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      {error && <ErrorState message={error} onRetry={fetchCompanyData} />}
      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} />}

      {/* 公司选择 */}
      <div className="rounded-lg border border-slate-100 bg-white px-5 py-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">选择公司</h3>
        <div className="flex flex-wrap gap-2">
          {companies.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCompanyId(c.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedCompanyId === c.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* 创建规则 */}
      {selectedCompanyId && (
        <div className="rounded-lg border border-slate-100 bg-white px-5 py-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">创建分配规则</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">问题分类</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">目标业务组</label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
              >
                {groups.length === 0 && <option value="">（无业务组）</option>}
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={createRule}
              disabled={submitting || !categoryId || !groupId}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              创建规则
            </button>
          </div>
        </div>
      )}

      {/* 规则列表 */}
      {selectedCompanyId && (
        <div className="rounded-lg border border-slate-100 bg-white px-5 py-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">
            已有规则（{rules.length}）
          </h3>
          {rules.length === 0 ? (
            <EmptyState title="暂无分配规则" hint="创建规则后，该分类的新工单将自动分配到对应业务组" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400">
                  <th className="py-2 text-left font-medium">分类</th>
                  <th className="py-2 text-left font-medium">目标业务组</th>
                  <th className="py-2 text-left font-medium">创建时间</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50">
                    <td className="py-2 text-slate-700">{r.categoryName}</td>
                    <td className="py-2 text-slate-700">{r.groupName}</td>
                    <td className="py-2 text-slate-400">{formatTime(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}
