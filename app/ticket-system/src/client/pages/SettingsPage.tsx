import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { fetchUsers } from '../api/auth'
import {
  createCategoryRule,
  createGroup,
  deleteCategoryRule,
  fetchCategoryRules,
  fetchCompanies,
  fetchGroups,
  updateGroup,
} from '../api/config'
import { apiErrorText } from '../api/helpers'
import type { CategoryRule, Company, Group, UserListItem } from '../api/types'
import { useToast } from '../components/Toast'
import { EmptyState, ErrorBanner, ListSkeleton, Modal } from '../components/ui'
import { roleLabels } from '../format'

export default function SettingsPage() {
  const [companies, setCompanies] = useState<Company[] | null>(null)
  const [companyId, setCompanyId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    setCompanies(null)
    setError(null)
    fetchCompanies()
      .then(result => {
        if (cancelled) return
        setCompanies(result.items)
        setCompanyId(current => current || result.items[0]?.id || '')
      })
      .catch(err => {
        if (!cancelled) setError(apiErrorText(err))
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-5xl space-y-4 p-4 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-900">配置管理</h1>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xs text-slate-500">公司</span>
            <select
              value={companyId}
              onChange={event => setCompanyId(event.target.value)}
              className="input-base w-40 py-1.5"
              disabled={!companies}
            >
              {companies?.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <ErrorBanner message={error} onRetry={() => setReload(value => value + 1)} />}

        {companies && companies.length === 0 && <EmptyState title="暂无可配置的公司" />}

        {companyId ? (
          <>
            <GroupsSection companyId={companyId} />
            <RulesSection companyId={companyId} />
          </>
        ) : (
          !error && <EmptyState title="请选择要配置的公司" />
        )}
      </div>
    </div>
  )
}

function GroupsSection({ companyId }: { companyId: string }) {
  const toast = useToast()
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [users, setUsers] = useState<UserListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ mode: 'create' } | { mode: 'edit'; group: Group } | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [groupResult, userResult] = await Promise.all([fetchGroups(companyId), fetchUsers(companyId)])
      setGroups(groupResult.items)
      setUsers(userResult.items)
    } catch (err) {
      setError(apiErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    setGroups(null)
    void refresh()
  }, [refresh])

  return (
    <div className="card-base">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">业务组与成员</h2>
        <button type="button" className="btn-primary py-1.5" onClick={() => setEditing({ mode: 'create' })}>
          新建业务组
        </button>
      </div>
      <div className="p-4">
        {error ? (
          <ErrorBanner message={error} onRetry={() => void refresh()} />
        ) : loading || groups === null ? (
          <ListSkeleton rows={3} cols={2} />
        ) : groups.length === 0 ? (
          <EmptyState title="该公司暂无业务组" description="新建业务组后可设置成员并配置分类分配规则" />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left font-medium">业务组</th>
                <th className="px-2 py-2 text-left font-medium">成员</th>
                <th className="px-2 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groups.map(group => (
                <tr key={group.id}>
                  <td className="py-2.5 pr-4 font-medium text-slate-800">{group.name}</td>
                  <td className="py-2.5 pr-4">
                    {group.members.length === 0 ? (
                      <span className="text-slate-400">暂无成员</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {group.members.map(member => (
                          <span key={member.userId} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            {member.userName}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      className="text-xs text-indigo-600 hover:text-indigo-500"
                      onClick={() => setEditing({ mode: 'edit', group })}
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal
        open={editing !== null}
        title={editing?.mode === 'edit' ? '编辑业务组' : '新建业务组'}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <GroupForm
            companyId={companyId}
            users={users}
            group={editing.mode === 'edit' ? editing.group : null}
            onSaved={saved => {
              const wasEdit = editing.mode === 'edit'
              setEditing(null)
              toast.push('success', wasEdit ? `业务组“${saved.name}”已保存` : `业务组“${saved.name}”已创建`)
              void refresh()
            }}
          />
        )}
      </Modal>
    </div>
  )
}

function GroupForm({
  companyId,
  users,
  group,
  onSaved,
}: {
  companyId: string
  users: UserListItem[]
  group: Group | null
  onSaved: (saved: Group) => void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [memberIds, setMemberIds] = useState<string[]>(group?.members.map(member => member.userId) ?? [])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleMember = (userId: string, checked: boolean) => {
    setMemberIds(ids => (checked ? [...ids, userId] : ids.filter(id => id !== userId)))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('请填写业务组名称')
      return
    }
    if (trimmedName.length > 100) {
      setError('业务组名称不能超过 100 字')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const saved = group
        ? await updateGroup(group.id, { name: trimmedName, memberIds })
        : await createGroup({ companyId, name: trimmedName, memberIds })
      onSaved(saved)
    } catch (err) {
      setError(apiErrorText(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">业务组名称</span>
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          maxLength={100}
          placeholder="如：技术支持一组"
          className="input-base"
        />
      </label>
      <div className="space-y-1">
        <span className="text-xs font-medium text-slate-600">成员（已选 {memberIds.length} 人）</span>
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
          {users.length === 0 ? (
            <p className="px-1 py-2 text-xs text-slate-400">该公司暂无用户可选</p>
          ) : (
            users.map(user => (
              <label key={user.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={memberIds.includes(user.id)}
                  onChange={event => toggleMember(user.id, event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                <span className="text-slate-800">{user.name}</span>
                <span className="text-xs text-slate-400">{user.email}</span>
                <span className="ml-auto text-xs text-slate-400">
                  {roleLabels[user.role]}
                  {user.department ? ` · ${user.department}` : ''}
                </span>
              </label>
            ))
          )}
        </div>
        <p className="text-xs text-slate-400">保存后成员按当前勾选全量设置。</p>
      </div>
      {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? '保存中…' : '保存'}
        </button>
      </div>
    </form>
  )
}

function RulesSection({ companyId }: { companyId: string }) {
  const toast = useToast()
  const [rules, setRules] = useState<CategoryRule[] | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [ruleResult, groupResult] = await Promise.all([fetchCategoryRules(companyId), fetchGroups(companyId)])
      setRules(ruleResult.items)
      setGroups(groupResult.items)
    } catch (err) {
      setError(apiErrorText(err))
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    setRules(null)
    void refresh()
  }, [refresh])

  const doDelete = async (id: string) => {
    setDeleting(true)
    try {
      await deleteCategoryRule(id)
      toast.push('success', '分配规则已删除')
      setConfirmDeleteId(null)
      await refresh()
    } catch (err) {
      toast.push('error', apiErrorText(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="card-base">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">分类分配规则</h2>
        <button type="button" className="btn-primary py-1.5" onClick={() => setCreating(true)}>
          新增规则
        </button>
      </div>
      <div className="p-4">
        <p className="mb-3 text-xs text-slate-400">该公司新提交的工单将按问题分类自动分配到对应业务组，无需提交人选择。</p>
        {error ? (
          <ErrorBanner message={error} onRetry={() => void refresh()} />
        ) : loading || rules === null ? (
          <ListSkeleton rows={3} cols={2} />
        ) : rules.length === 0 ? (
          <EmptyState title="该公司暂无分类分配规则" description="新增规则后，匹配分类的新工单将自动分配" />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left font-medium">问题分类</th>
                <th className="px-2 py-2 text-left font-medium">分配至业务组</th>
                <th className="px-2 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rules.map(rule => (
                <tr key={rule.id}>
                  <td className="py-2.5 pr-4 text-slate-800">{rule.category}</td>
                  <td className="py-2.5 pr-4 text-slate-600">{rule.groupName}</td>
                  <td className="py-2.5 text-right">
                    {confirmDeleteId === rule.id ? (
                      <span className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          disabled={deleting}
                          className="btn-danger px-2.5 py-1 text-xs"
                          onClick={() => void doDelete(rule.id)}
                        >
                          确认删除
                        </button>
                        <button
                          type="button"
                          className="btn-secondary px-2.5 py-1 text-xs"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          取消
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:text-red-500"
                        onClick={() => setConfirmDeleteId(rule.id)}
                      >
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={creating} title="新增分类分配规则" onClose={() => setCreating(false)}>
        <RuleForm
          companyId={companyId}
          groups={groups}
          onSaved={() => {
            setCreating(false)
            toast.push('success', '分配规则已保存')
            void refresh()
          }}
        />
      </Modal>
    </div>
  )
}

function RuleForm({ companyId, groups, onSaved }: { companyId: string; groups: Group[]; onSaved: () => void }) {
  const [category, setCategory] = useState('')
  const [groupId, setGroupId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedCategory = category.trim()
    if (!trimmedCategory) {
      setError('请填写问题分类')
      return
    }
    if (trimmedCategory.length > 50) {
      setError('分类不能超过 50 字')
      return
    }
    if (!groupId) {
      setError('请选择分配到的业务组')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await createCategoryRule({ companyId, category: trimmedCategory, groupId })
      onSaved()
    } catch (err) {
      setError(apiErrorText(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">问题分类</span>
        <input
          value={category}
          onChange={event => setCategory(event.target.value)}
          maxLength={50}
          placeholder="如：账号权限"
          className="input-base"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">分配至业务组</span>
        <select value={groupId} onChange={event => setGroupId(event.target.value)} className="input-base">
          <option value="">请选择业务组</option>
          {groups.map(group => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      {groups.length === 0 && <p className="text-xs text-amber-600">该公司暂无业务组，请先创建业务组。</p>}
      {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? '保存中…' : '保存规则'}
        </button>
      </div>
    </form>
  )
}
