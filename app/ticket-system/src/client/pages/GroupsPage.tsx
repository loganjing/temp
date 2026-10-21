import { Loader2, Plus, Users, X } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { addGroupMembers, createGroup, listCompanyUsers, listGroups, removeGroupMember } from '../api/endpoints'
import type { CompanyUser, GroupInfo } from '../api/types'
import { InlineNotice, SkeletonList } from '../components/feedback'
import { PageHeader } from '../components/layout'
import { useToast } from '../components/Toast'
import { formatDateTime } from '../lib/labels'

export default function GroupsPage() {
  const toast = useToast()
  const [groups, setGroups] = useState<GroupInfo[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[] | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const response = await listGroups()
      setGroups(response.items)
    } catch (err) {
      setGroups(null)
      setLoadError(err instanceof Error ? err.message : '加载业务组失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    listCompanyUsers()
      .then((response) => setCompanyUsers(response.items))
      .catch(() => setCompanyUsers([]))
  }, [reload])

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (creating) return
    if (!name.trim()) {
      setCreateError('请填写业务组名称')
      return
    }
    setCreateError(null)
    setCreating(true)
    try {
      await createGroup(name.trim(), description.trim())
      toast.show('业务组已创建')
      setName('')
      setDescription('')
      await reload()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '创建业务组失败，请稍后重试')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="业务组" subtitle="管理本公司的工单承接业务组与成员；业务组为公司私有" />
      <div className="mx-auto max-w-4xl space-y-5 px-6 py-5">
        <form onSubmit={handleCreate} className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">创建业务组</h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1 space-y-1.5">
              <label htmlFor="group-name" className="text-xs font-medium text-slate-700">
                组名 <span className="text-red-500">*</span>
              </label>
              <input
                id="group-name"
                type="text"
                maxLength={50}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：产品支持组（≤50 字）"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <label htmlFor="group-description" className="text-xs font-medium text-slate-700">
                描述
              </label>
              <input
                id="group-description"
                type="text"
                maxLength={200}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="业务组职责说明（可选，≤200 字）"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="inline-flex shrink-0 items-center gap-1.5 self-end rounded-md bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
              创建业务组
            </button>
          </div>
          {createError ? (
            <div className="mt-3">
              <InlineNotice kind="error">{createError}</InlineNotice>
            </div>
          ) : null}
        </form>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              业务组列表{groups !== null ? `（${groups.length}）` : ''}
            </h2>
          </div>
          {loading && groups === null && loadError === null ? (
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
          ) : groups !== null && groups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <Users className="h-9 w-9 text-slate-300" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-600">暂无业务组</p>
              <p className="max-w-sm text-xs leading-5 text-slate-400">
                创建业务组并添加成员后，即可在「分配规则」中配置分类自动分配。
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(groups ?? []).map((group) => (
                <li key={group.id}>
                  <GroupCard
                    group={group}
                    companyUsers={companyUsers}
                    onRefresh={() => void reload()}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function GroupCard({
  group,
  companyUsers,
  onRefresh,
}: {
  group: GroupInfo
  companyUsers: CompanyUser[] | null
  onRefresh: () => void
}) {
  const toast = useToast()
  const [memberFormOpen, setMemberFormOpen] = useState(false)
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<number | null>(null)

  const memberIds = new Set(group.members.map((member) => member.id))

  const toggleUser = (userId: number) => {
    setSelectedUserIds((previous) =>
      previous.includes(userId) ? previous.filter((id) => id !== userId) : [...previous, userId],
    )
  }

  const handleAddMembers = async (event: FormEvent) => {
    event.preventDefault()
    if (pending || selectedUserIds.length === 0) return
    setActionError(null)
    setPending(true)
    try {
      await addGroupMembers(group.id, selectedUserIds)
      toast.show('成员已添加')
      setSelectedUserIds([])
      setMemberFormOpen(false)
      onRefresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '添加成员失败，请稍后重试')
    } finally {
      setPending(false)
    }
  }

  const handleRemoveMember = async (userId: number) => {
    if (pending) return
    setActionError(null)
    setRemovingUserId(userId)
    try {
      await removeGroupMember(group.id, userId)
      toast.show('成员已移除')
      onRefresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '移除成员失败，请稍后重试')
    } finally {
      setRemovingUserId(null)
    }
  }

  return (
    <div className="px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{group.name}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{group.memberCount} 名成员</span>
          </div>
          {group.description ? (
            <p className="mt-1 text-xs leading-5 text-slate-500" title={group.description}>
              {group.description}
            </p>
          ) : null}
          <p className="mt-1 text-[11px] text-slate-400">创建于 {formatDateTime(group.createdAt)}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setActionError(null)
            setMemberFormOpen((open) => !open)
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          添加成员
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {group.members.length === 0 ? (
          <span className="text-xs text-slate-400">暂无成员</span>
        ) : (
          group.members.map((member) => (
            <span
              key={member.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1.5 text-xs text-slate-700"
              title={`${member.fullName} · ${member.department || '未填写部门'}`}
            >
              {member.fullName}
              <span className="text-[10px] text-slate-400">{member.department || '—'}</span>
              <button
                type="button"
                onClick={() => void handleRemoveMember(member.id)}
                disabled={removingUserId !== null}
                aria-label={`移除成员 ${member.fullName}`}
                className="rounded-full p-0.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
              >
                {removingUserId === member.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <X className="h-3 w-3" aria-hidden="true" />
                )}
              </button>
            </span>
          ))
        )}
      </div>

      {actionError ? (
        <div className="mt-3">
          <InlineNotice kind="error">{actionError}</InlineNotice>
        </div>
      ) : null}

      {memberFormOpen ? (
        <form onSubmit={handleAddMembers} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-600">选择要添加的本公司用户（已在组内的会被忽略）</p>
          {companyUsers === null ? (
            <p className="mt-2 text-xs text-slate-400">正在加载用户列表…</p>
          ) : companyUsers.length === 0 ? (
            <p className="mt-2 text-xs text-slate-400">本公司暂无其他用户可添加。</p>
          ) : (
            <ul className="mt-2 grid max-h-56 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
              {companyUsers.map((candidate) => (
                <li key={candidate.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(candidate.id)}
                      onChange={() => toggleUser(candidate.id)}
                      disabled={pending}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="min-w-0 flex-1 truncate text-slate-700" title={candidate.fullName}>
                      {candidate.fullName}
                      <span className="ml-1 text-[10px] text-slate-400">{candidate.department || '—'}</span>
                    </span>
                    {memberIds.has(candidate.id) ? (
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">已在组内</span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="submit"
              disabled={pending || companyUsers === null || selectedUserIds.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              添加所选成员（{selectedUserIds.length}）
            </button>
            <button
              type="button"
              onClick={() => setMemberFormOpen(false)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
            >
              关闭
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
