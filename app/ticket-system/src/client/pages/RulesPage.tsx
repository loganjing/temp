import { useState } from 'react'
import { apiRequest } from '../platform/api-client'
import { useAsyncData } from '../components/useAsyncData'
import { ErrorNotice, PageHeader, SkeletonList, SuccessNotice } from '../components/ui'
import type { CategoryRule, Group } from '../types'

/** 分配规则配置：维护“分类 → 业务组”自动分配规则；未匹配分类的新工单保持待分配。 */
export default function RulesPage() {
  const categories = useAsyncData<{ items: string[] }>(() => apiRequest('/api/categories'), [])
  const groups = useAsyncData<{ items: Group[] }>(() => apiRequest('/api/groups'), [])
  const rules = useAsyncData<{ items: CategoryRule[] }>(() => apiRequest('/api/category-rules'), [])

  const [category, setCategory] = useState('')
  const [groupId, setGroupId] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [formError, setFormError] = useState('')

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editCategory, setEditCategory] = useState('')
  const [editGroupId, setEditGroupId] = useState('')
  const [editError, setEditError] = useState('')

  const submitCreate = async () => {
    if (!category.trim() || !groupId) return
    setBusy(true)
    setNotice('')
    setFormError('')
    try {
      await apiRequest('/api/category-rules', {
        method: 'POST',
        body: JSON.stringify({ category: category.trim(), groupId: Number(groupId) }),
      })
      setNotice(`规则已创建：分类「${category.trim()}」命中后自动分配到所选业务组`)
      setCategory('')
      setGroupId('')
      rules.reload()
      categories.reload()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : '创建失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const submitEdit = async () => {
    if (editingId == null || !editCategory.trim() || !editGroupId) return
    setBusy(true)
    setNotice('')
    setEditError('')
    try {
      await apiRequest(`/api/category-rules/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({ category: editCategory.trim(), groupId: Number(editGroupId) }),
      })
      setNotice('规则已更新')
      setEditingId(null)
      rules.reload()
      categories.reload()
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : '更新失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const groupList = groups.data?.items ?? []
  const ruleList = rules.data?.items ?? []

  return (
    <div>
      <PageHeader
        title="分配规则"
        description="为本公司配置“分类 → 业务组”自动分配规则；新提交工单按分类自动分配，未匹配时保持待分配等待人工处理。"
      />

      <section className="card mb-4 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">新建分配规则</h2>
        <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="field">
            <span className="label">分类（必填，最多 50 字，可选已有分类或输入新分类）</span>
            <input
              className="input"
              list="rule-category-options"
              maxLength={50}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              disabled={busy}
              placeholder="如：账户登录"
            />
            <datalist id="rule-category-options">
              {(categories.data?.items ?? []).map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span className="label">分配到业务组（必选）</span>
            <select
              className="input"
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              disabled={busy}
            >
              <option value="">请选择业务组</option>
              {groupList.map((group) => (
                <option key={group.groupId} value={group.groupId}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn"
            disabled={busy || !category.trim() || !groupId}
            onClick={() => void submitCreate()}
          >
            {busy ? '保存中…' : '创建规则'}
          </button>
        </div>
        {(formError || notice) && (
          <div className="mt-3 space-y-2">
            {notice && <SuccessNotice>{notice}</SuccessNotice>}
            <ErrorNotice error={formError} />
          </div>
        )}
        {groupList.length === 0 && (
          <p className="mt-2 text-xs text-amber-600">尚未创建业务组：请先在「业务组配置」中创建业务组。</p>
        )}
      </section>

      <section className="card">
        <div className="border-b border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-700">本公司分配规则（{ruleList.length}）</h2>
        </div>
        {rules.loading ? (
          <SkeletonList rows={4} />
        ) : rules.error ? (
          <div className="p-4">
            <ErrorNotice error={rules.error} onRetry={rules.reload} />
          </div>
        ) : ruleList.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-600">尚未配置分配规则</p>
            <p className="text-xs text-slate-400">配置后，新提交的工单将按分类自动分配到对应业务组。</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {ruleList.map((rule) => (
              <li key={rule.ruleId} className="p-4">
                {editingId === rule.ruleId ? (
                  <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                    <label className="field">
                      <span className="label">分类</span>
                      <input
                        className="input"
                        list="rule-edit-category-options"
                        maxLength={50}
                        value={editCategory}
                        onChange={(event) => setEditCategory(event.target.value)}
                        disabled={busy}
                      />
                      <datalist id="rule-edit-category-options">
                        {(categories.data?.items ?? []).map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </label>
                    <label className="field">
                      <span className="label">分配到业务组</span>
                      <select
                        className="input"
                        value={editGroupId}
                        onChange={(event) => setEditGroupId(event.target.value)}
                        disabled={busy}
                      >
                        <option value="">请选择业务组</option>
                        {groupList.map((group) => (
                          <option key={group.groupId} value={group.groupId}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy || !editCategory.trim() || !editGroupId}
                      onClick={() => void submitEdit()}
                    >
                      {busy ? '保存中…' : '保存'}
                    </button>
                    <button type="button" className="btn-secondary" disabled={busy} onClick={() => setEditingId(null)}>
                      取消
                    </button>
                    <div className="sm:col-span-4">
                      <ErrorNotice error={editError} />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-700">
                      <span className="font-medium">{rule.category}</span>
                      <span className="mx-2 text-slate-300">→</span>
                      <span className="font-medium text-indigo-700">{rule.groupName}</span>
                    </p>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        setEditingId(rule.ruleId)
                        setEditCategory(rule.category)
                        setEditGroupId(String(rule.groupId))
                        setEditError('')
                      }}
                    >
                      编辑
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
