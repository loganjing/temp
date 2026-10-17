import { useCallback, useEffect, useState } from 'react'
import { api } from '../platform/api'
import type { GroupSummary } from '../platform/contracts'
import { useApp } from '../app-context'

export default function GroupsPage() {
  const { companyId, currentUsers } = useApp()

  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')

  // 正在编辑成员的业务组 id，以及成员勾选状态（按用户 id）。
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [draftMemberIds, setDraftMemberIds] = useState<string[]>([])

  const load = useCallback(() => {
    if (!companyId) return
    setError(null)
    api.groups(companyId)
      .then((result) => setGroups(result.groups))
      .catch((cause: unknown) => {
        setGroups([])
        setError(cause instanceof Error ? cause.message : '加载业务组失败')
      })
  }, [companyId])

  useEffect(() => {
    setGroups(null)
    setEditingGroupId(null)
    load()
  }, [load])

  function handleCreateGroup(event: React.FormEvent) {
    event.preventDefault()
    if (!companyId || !newGroupName.trim()) return
    setError(null)
    api.createGroup(companyId, newGroupName.trim())
      .then(() => { setNewGroupName(''); load() })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : '新建业务组失败'))
  }

  function handleSaveMembers(groupId: string) {
    setError(null)
    api.setGroupMembers(groupId, draftMemberIds)
      .then(() => { setEditingGroupId(null); load() })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : '保存成员失败'))
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-lg font-semibold">业务组管理</h1>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

      <form className="mt-4 flex gap-2" onSubmit={handleCreateGroup}>
        <input
          className="w-64 rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="新业务组名称"
          value={newGroupName}
          onChange={(event) => setNewGroupName(event.target.value)}
        />
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          disabled={!newGroupName.trim()}
        >
          新建业务组
        </button>
      </form>

      {groups === null && !error && <p className="mt-4 text-sm text-slate-400">加载中…</p>}
      {groups?.length === 0 && <p className="mt-4 text-sm text-slate-400">暂无业务组</p>}
      <ul className="mt-4 flex flex-col gap-3">
        {groups?.map((group) => (
          <li key={group.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{group.name}</h2>
              <button
                type="button"
                className="text-xs text-blue-700 hover:underline"
                onClick={() => {
                  if (editingGroupId === group.id) {
                    setEditingGroupId(null)
                    return
                  }
                  setEditingGroupId(group.id)
                  setDraftMemberIds(group.memberIds)
                }}
              >
                {editingGroupId === group.id ? '收起' : '维护成员'}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {group.memberIds.length === 0 && <span className="text-xs text-slate-400">暂无成员</span>}
              {group.memberIds.map((memberId) => (
                <span key={memberId} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  {currentUsers.find((user) => user.id === memberId)?.name ?? memberId}
                </span>
              ))}
            </div>
            {editingGroupId === group.id && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-600">选择该业务组的成员（保存后全量替换）：</p>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {currentUsers.map((user) => (
                    <label key={user.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draftMemberIds.includes(user.id)}
                        onChange={(event) => {
                          setDraftMemberIds((current) =>
                            event.target.checked
                              ? [...current, user.id]
                              : current.filter((id) => id !== user.id),
                          )
                        }}
                      />
                      {user.name}（{user.department ?? '无部门'}）
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                  onClick={() => handleSaveMembers(group.id)}
                >
                  保存成员
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
