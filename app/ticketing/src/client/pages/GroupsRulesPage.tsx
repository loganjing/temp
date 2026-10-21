import { useState, type FormEvent } from 'react'
import { ApiRequestError, assignmentApi } from '../platform/api-client'
import type { Group, SessionUser } from '../components/contracts'
import { Card, EmptyState, ErrorInline, SectionHeading, Spinner, TableSkeleton, useAsync, useToast } from '../components/ui'

interface Props { currentUser: SessionUser }

export default function GroupsRulesPage({ currentUser }: Props) {
  const toast = useToast()
  const groups = useAsync(() => assignmentApi.listGroups(), [])
  const rules = useAsync(() => assignmentApi.listRules(), [])
  const [groupName, setGroupName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ruleCategory, setRuleCategory] = useState('')
  const [ruleGroup, setRuleGroup] = useState('')
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [memberUserId, setMemberUserId] = useState<{ [groupId: number]: string }>({})
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)
  const [editRuleCategory, setEditRuleCategory] = useState('')
  const [editRuleGroup, setEditRuleGroup] = useState('')

  const reloadAll = () => { groups.reload(); rules.reload() }
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await fn(); toast.success(`${label}成功`); reloadAll() }
    catch (cause) { setError(cause instanceof ApiRequestError ? cause.message : `${label}失败`); toast.error(cause instanceof ApiRequestError ? cause.message : `${label}失败`) }
    finally { setBusy(false) }
  }

  const submitGroup = (e: FormEvent) => {
    e.preventDefault()
    if (!groupName.trim()) return
    void run('创建业务组', () => assignmentApi.createGroup(groupName.trim()).then(() => setGroupName('')))
  }
  const updateGroup = (group: Group) => {
    if (!editName.trim()) return
    void run('更新业务组', () => assignmentApi.updateGroup(group.id, editName.trim()).then(() => setEditingGroupId(null)))
  }
  const deleteGroup = (group: Group) => void run('删除业务组', () => assignmentApi.deleteGroup(group.id))
  const addMember = (group: Group) => {
    const id = Number(memberUserId[group.id])
    if (!id) { setError('请输入用户 ID'); return }
    void run('添加成员', () => assignmentApi.addMember(group.id, id).then(() => setMemberUserId((m) => ({ ...m, [group.id]: '' }))))
  }
  const removeMember = (group: Group, userId: number) => void run('移除成员', () => assignmentApi.removeMember(group.id, userId))

  const submitRule = (e: FormEvent) => {
    e.preventDefault()
    const gid = Number(ruleGroup)
    if (!ruleCategory.trim() || !gid) { setError('请填写分类与目标业务组'); return }
    void run('创建规则', () => assignmentApi.createRule(ruleCategory.trim(), gid).then(() => { setRuleCategory(''); setRuleGroup('') }))
  }
  const updateRule = (id: number) => {
    const gid = Number(editRuleGroup)
    if (!editRuleCategory.trim() || !gid) return
    void run('更新规则', () => assignmentApi.updateRule(id, editRuleCategory.trim(), gid).then(() => setEditingRuleId(null)))
  }
  const deleteRule = (id: number) => void run('删除规则', () => assignmentApi.deleteRule(id))

  const groupItems = groups.data?.items ?? []
  const ruleItems = rules.data?.items ?? []

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <SectionHeading title="业务组管理" subtitle={`公司：${currentUser.company.name}`} />
        {error && <ErrorInline message={error} />}
        <form onSubmit={submitGroup} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
            业务组名称
            <input className="min-w-48" value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={64} required placeholder="如 技术支持组" />
          </label>
          <button disabled={busy}>新建业务组</button>
        </form>
      </Card>

      <Card className="p-0">
        <SectionHeading title="业务组列表" subtitle={`${groupItems.length} 个`} />
        <div className="px-5 pb-5">
          {groups.loading ? <TableSkeleton rows={3} cols={3} /> : groupItems.length === 0 ? (
            <EmptyState title="暂无业务组" hint="新建第一个业务组" />
          ) : (
            <div className="flex flex-col gap-4">
              {groupItems.map((g) => (
                <div key={g.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      {editingGroupId === g.id ? (
                        <input className="min-w-40" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={64} />
                      ) : (
                        <p className="font-medium text-slate-800 dark:text-slate-100">{g.name}</p>
                      )}
                      <p className="text-xs text-slate-400">成员 {g.members.length} 人</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {editingGroupId === g.id ? (
                        <>
                          <button disabled={busy} onClick={() => updateGroup(g)}>保存</button>
                          <button className="secondary" onClick={() => setEditingGroupId(null)}>取消</button>
                        </>
                      ) : (
                        <>
                          <button className="secondary" onClick={() => { setEditingGroupId(g.id); setEditName(g.name) }}>重命名</button>
                          <button className="secondary" disabled={busy} onClick={() => deleteGroup(g)}>删除</button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">成员</p>
                    {g.members.length === 0 ? (
                      <p className="text-sm text-slate-400">无成员</p>
                    ) : (
                      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                        {g.members.map((m) => (
                          <li key={m.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                            <span><span className="font-medium">{m.name}</span> · <span className="text-slate-400">{m.email} · {m.department}</span></span>
                            <button className="secondary text-xs" disabled={busy} onClick={() => removeMember(g, m.id)}>移除</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2 flex items-end gap-2">
                      <input
                        className="min-w-40"
                        type="number"
                        placeholder="用户 ID"
                        value={memberUserId[g.id] ?? ''}
                        onChange={(e) => setMemberUserId((m) => ({ ...m, [g.id]: e.target.value }))}
                      />
                      <button className="secondary text-xs" disabled={busy} onClick={() => addMember(g)}>添加成员</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <SectionHeading title="分配规则管理" subtitle="问题分类 → 业务组" />
        <form onSubmit={submitRule} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
            问题分类
            <input className="min-w-40" value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value)} maxLength={64} required placeholder="如 技术支持" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
            目标业务组
            <select value={ruleGroup} onChange={(e) => setRuleGroup(e.target.value)}>
              <option value="">选择业务组…</option>
              {groupItems.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <button disabled={busy}>新建规则</button>
        </form>
      </Card>

      <Card className="p-0">
        <div className="px-5 py-4">
          <SectionHeading title="规则列表" subtitle={`${ruleItems.length} 条`} />
          {rules.loading ? <Spinner /> : ruleItems.length === 0 ? (
            <EmptyState title="暂无分配规则" hint="未命中规则时新工单停留待分配" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead><tr><th className="p-3 text-xs text-slate-500">分类</th><th className="p-3 text-xs text-slate-500">目标业务组</th><th className="p-3 text-xs text-slate-500">操作</th></tr></thead>
                <tbody>
                  {ruleItems.map((r) => (
                    <tr key={r.id} className="border-t border-slate-200 dark:border-slate-700">
                      {editingRuleId === r.id ? (
                        <>
                          <td className="p-3"><input className="min-w-32" value={editRuleCategory} onChange={(e) => setEditRuleCategory(e.target.value)} maxLength={64} /></td>
                          <td className="p-3">
                            <select value={editRuleGroup} onChange={(e) => setEditRuleGroup(e.target.value)}>
                              {groupItems.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                          </td>
                          <td className="p-3"><div className="flex gap-2"><button disabled={busy} onClick={() => updateRule(r.id)}>保存</button><button className="secondary" onClick={() => setEditingRuleId(null)}>取消</button></div></td>
                        </>
                      ) : (
                        <>
                          <td className="p-3">{r.category}</td>
                          <td className="p-3">{r.groupName}</td>
                          <td className="p-3"><div className="flex gap-2"><button className="secondary text-xs" onClick={() => { setEditingRuleId(r.id); setEditRuleCategory(r.category); setEditRuleGroup(String(r.groupId)) }}>编辑</button><button className="secondary text-xs" disabled={busy} onClick={() => deleteRule(r.id)}>删除</button></div></td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
