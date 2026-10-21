import { Loader2, Save, Trash2, Workflow } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { deleteRule, listCategories, listGroups, listRules, upsertRule } from '../api/endpoints'
import type { Category, GroupInfo, RuleInfo } from '../api/types'
import { InlineNotice, SkeletonList } from '../components/feedback'
import { PageHeader } from '../components/layout'
import { useToast } from '../components/Toast'
import { formatDateTime } from '../lib/labels'

export default function RulesPage() {
  const toast = useToast()
  const [rules, setRules] = useState<RuleInfo[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [groups, setGroups] = useState<GroupInfo[] | null>(null)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [groupId, setGroupId] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingCategoryId, setDeletingCategoryId] = useState<number | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const response = await listRules()
      setRules(response.items)
    } catch (err) {
      setRules(null)
      setLoadError(err instanceof Error ? err.message : '加载分配规则失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    listCategories()
      .then((response) => setCategories(response.items))
      .catch(() => setCategories([]))
    listGroups()
      .then((response) => setGroups(response.items))
      .catch(() => setGroups([]))
  }, [reload])

  const handleUpsert = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    if (categoryId == null) {
      setFormError('请选择问题分类')
      return
    }
    if (groupId == null) {
      setFormError('请选择目标业务组')
      return
    }
    setFormError(null)
    setSaving(true)
    try {
      await upsertRule(categoryId, groupId)
      toast.show('分配规则已保存')
      setCategoryId(null)
      setGroupId(null)
      await reload()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存分配规则失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (rule: RuleInfo) => {
    if (deletingCategoryId !== null) return
    setDeletingCategoryId(rule.categoryId)
    setFormError(null)
    try {
      await deleteRule(rule.categoryId)
      toast.show(`已删除「${rule.categoryName}」的分配规则`)
      await reload()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '删除分配规则失败，请稍后重试')
      await reload()
    } finally {
      setDeletingCategoryId(null)
    }
  }

  const canUpsert = (categories ?? []).length > 0 && (groups ?? []).length > 0

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title="分配规则"
        subtitle="配置本公司「问题分类 → 业务组」自动分配规则；新工单按分类命中规则后自动进入待处理"
      />
      <div className="mx-auto max-w-4xl space-y-5 px-6 py-5">
        <form onSubmit={handleUpsert} className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">新增 / 更新规则</h2>
          <p className="mt-1 text-[11px] text-slate-400">同一分类已存在规则时，保存将改为指向所选业务组。</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <label htmlFor="rule-category" className="text-xs font-medium text-slate-700">
                问题分类 <span className="text-red-500">*</span>
              </label>
              <select
                id="rule-category"
                value={categoryId ?? ''}
                onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : null)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">请选择分类</option>
                {(categories ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 space-y-1.5">
              <label htmlFor="rule-group" className="text-xs font-medium text-slate-700">
                目标业务组 <span className="text-red-500">*</span>
              </label>
              <select
                id="rule-group"
                value={groupId ?? ''}
                onChange={(event) => setGroupId(event.target.value ? Number(event.target.value) : null)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">请选择业务组</option>
                {(groups ?? []).map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}（{group.memberCount} 人）
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={saving || !canUpsert}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
              保存规则
            </button>
          </div>
          {!canUpsert ? (
            <div className="mt-3">
              <InlineNotice kind="info">
                需要先在「业务组」页创建业务组，才能配置分配规则。
              </InlineNotice>
            </div>
          ) : null}
          {formError ? (
            <div className="mt-3">
              <InlineNotice kind="error">{formError}</InlineNotice>
            </div>
          ) : null}
        </form>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              规则列表{rules !== null ? `（${rules.length}）` : ''}
            </h2>
          </div>
          {loading && rules === null && loadError === null ? (
            <SkeletonList rows={3} />
          ) : loadError !== null ? (
            <div className="p-4">
              <InlineNotice kind="error">
                {loadError}
                <button type="button" onClick={() => void reload()} className="ml-2 font-medium underline underline-offset-2">
                  重试
                </button>
              </InlineNotice>
            </div>
          ) : rules !== null && rules.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <Workflow className="h-9 w-9 text-slate-300" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-600">暂无分配规则</p>
              <p className="max-w-sm text-xs leading-5 text-slate-400">
                未命中规则的分类，新工单将停留在「待分配」，等待手动分配。
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th scope="col" className="px-4 py-2.5 font-medium">问题分类</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">分配到业务组</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">创建时间</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(rules ?? []).map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 text-slate-700">{rule.categoryName}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">{rule.groupName}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{formatDateTime(rule.createdAt)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => void handleDelete(rule)}
                        disabled={deletingCategoryId !== null}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        {deletingCategoryId === rule.categoryId ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        )}
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
