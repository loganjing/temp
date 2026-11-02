import { useCallback, useEffect, useState } from 'react'
import { categoriesApi, groupsApi } from '../api/company'
import { usersApi } from '../api/auth'
import { EmptyState, ErrorState, SkeletonRows } from '../components/States'
import { PlusIcon, RefreshIcon, UserCheckIcon, XIcon } from '../components/Icon'
import { formatDate } from '../lib/format'
import type { AutoAssignRule, BusinessGroup, BusinessGroupMember, TicketCategory, UserInfo } from '../types'

export function GroupManagementPage({ user }: { user: UserInfo }) {
  const companyId = user.companyId
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [categories, setCategories] = useState<TicketCategory[]>([])
  const [rules, setRules] = useState<AutoAssignRule[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [members, setMembers] = useState<BusinessGroupMember[]>([])
  const [userList, setUserList] = useState<{ id: string; name: string; email: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [membersLoading, setMembersLoading] = useState(false)
  const [error, setError] = useState('')
  const [groupName, setGroupName] = useState('')
  const [busy, setBusy] = useState(false)
  const [ruleCategory, setRuleCategory] = useState('')
  const [ruleGroup, setRuleGroup] = useState('')
  const [addMemberUserId, setAddMemberUserId] = useState('')

  const loadGroups = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [gs, cats, rs] = await Promise.all([
        groupsApi.list(companyId),
        categoriesApi.list(companyId),
        groupsApi.rules(companyId),
      ])
      setGroups(gs)
      setCategories(cats)
      setRules(rs)
      if (!selectedId && gs.length > 0) setSelectedId(gs[0].id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载业务组失败')
    } finally {
      setLoading(false)
    }
  }, [companyId, selectedId])

  useEffect(() => { void loadGroups() }, [loadGroups])

  useEffect(() => {
    usersApi.list(companyId).then((r) => setUserList(r.users)).catch(() => setUserList([]))
  }, [companyId])

  useEffect(() => {
    if (!selectedId) { setMembers([]); return }
    setMembersLoading(true)
    groupsApi.members(companyId, selectedId)
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false))
  }, [companyId, selectedId])

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!groupName.trim()) return
    setBusy(true)
    setError('')
    try {
      const g = await groupsApi.create(companyId, groupName.trim())
      setGroupName('')
      setGroups((prev) => [...prev, g])
      setSelectedId(g.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建业务组失败')
    } finally {
      setBusy(false)
    }
  }

  const addMember = async () => {
    if (!selectedId || !addMemberUserId) return
    setBusy(true)
    setError('')
    try {
      await groupsApi.addMember(companyId, selectedId, addMemberUserId)
      setAddMemberUserId('')
      setMembers(await groupsApi.members(companyId, selectedId))
      setGroups(await groupsApi.list(companyId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '添加成员失败')
    } finally {
      setBusy(false)
    }
  }

  const removeMember = async (member: BusinessGroupMember) => {
    if (!selectedId) return
    setError('')
    try {
      await groupsApi.removeMember(companyId, selectedId, member.userId)
      setMembers(await groupsApi.members(companyId, selectedId))
      setGroups(await groupsApi.list(companyId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '移除成员失败')
    }
  }

  const createRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ruleCategory || !ruleGroup) return
    setBusy(true)
    setError('')
    try {
      await groupsApi.createRule(companyId, ruleCategory, ruleGroup)
      setRuleCategory('')
      setRules(await groupsApi.rules(companyId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建分配规则失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold text-slate-800">新建业务组</h2>
          <form onSubmit={createGroup} className="flex items-end gap-2">
            <label className="flex-1 text-xs text-slate-500">
              业务组名称
              <input className="mt-1" value={groupName} maxLength={80} placeholder="如：基础架构组" onChange={(e) => setGroupName(e.target.value)} required />
            </label>
            <button disabled={busy} className="inline-flex items-center gap-1.5"><PlusIcon size={15} /> 创建</button>
          </form>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold text-slate-800">自动分配规则（分类 → 业务组）</h2>
          <form onSubmit={createRule} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <label className="text-xs text-slate-500">
              分类
              <select className="mt-1" value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value)} required>
                <option value="">选择分类</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              目标业务组
              <select className="mt-1" value={ruleGroup} onChange={(e) => setRuleGroup(e.target.value)} required>
                <option value="">选择业务组</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            <button disabled={busy} className="inline-flex items-center gap-1.5"><PlusIcon size={15} /> 添加规则</button>
          </form>
        </section>
      </div>

      {error && <ErrorState message={error} onRetry={loadGroups} />}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">业务组列表 ({groups.length})</h3>
            <button type="button" className="secondary !min-h-0 !px-2 !py-1 inline-flex items-center gap-1" onClick={loadGroups}><RefreshIcon size={13} /></button>
          </div>
          {loading ? <SkeletonRows count={3} /> : groups.length === 0 ? (
            <EmptyState title="暂无业务组" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {groups.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(g.id)}
                    className={`flex w-full items-center justify-between px-2 py-2.5 text-left text-sm hover:bg-slate-50 ${selectedId === g.id ? 'bg-blue-50/60 text-blue-700' : 'text-slate-700'}`}
                  >
                    <span className="font-medium">{g.name}</span>
                    <span className="text-xs text-slate-500">{g.memberCount} 成员 · {formatDate(g.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">成员管理</h3>
          {!selectedId ? (
            <EmptyState title="选择左侧业务组查看成员" />
          ) : (
            <>
              <div className="mb-3 flex items-end gap-2">
                <label className="flex-1 text-xs text-slate-500">
                  添加成员
                  <select className="mt-1" value={addMemberUserId} onChange={(e) => setAddMemberUserId(e.target.value)}>
                    <option value="">选择用户</option>
                    {userList.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
                  </select>
                </label>
                <button type="button" disabled={busy || !addMemberUserId} className="inline-flex items-center gap-1.5" onClick={addMember}>
                  <UserCheckIcon size={15} /> 添加
                </button>
              </div>
              {membersLoading ? <SkeletonRows count={3} /> : members.length === 0 ? (
                <EmptyState title="该业务组暂无成员" />
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr><th className="px-2 py-2">成员</th><th className="px-2 py-2">邮箱</th><th className="px-2 py-2">加入时间</th><th className="px-2 py-2"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {members.map((m) => (
                      <tr key={m.id}>
                        <td className="px-2 py-2.5 font-medium text-slate-800">{m.userName}</td>
                        <td className="px-2 py-2.5 text-slate-600">{m.userEmail}</td>
                        <td className="px-2 py-2.5 text-slate-500">{formatDate(m.createdAt)}</td>
                        <td className="px-2 py-2.5 text-right">
                          <button type="button" className="secondary !min-h-0 !px-2 !py-1 inline-flex items-center gap-1 text-rose-600" onClick={() => void removeMember(m)}>
                            <XIcon size={13} /> 移除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">已配置自动分配规则 ({rules.length})</h3>
        {rules.length === 0 ? (
          <EmptyState title="暂无分配规则" description="配置“分类 → 业务组”后，新工单将按分类自动分配" />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr><th className="px-2 py-2">分类</th><th className="px-2 py-2">目标业务组</th><th className="px-2 py-2">创建时间</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className="px-2 py-2.5 font-medium text-slate-800">{r.categoryName}</td>
                  <td className="px-2 py-2.5 text-slate-600">{r.targetGroupName}</td>
                  <td className="px-2 py-2.5 text-slate-500">{formatDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

