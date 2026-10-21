import { useState } from 'react'
import { apiRequest } from '../platform/api-client'
import { useAsyncData } from '../components/useAsyncData'
import {
  ErrorNotice,
  PageHeader,
  SkeletonList,
  SuccessNotice,
  formatDateTime,
} from '../components/ui'
import type { Group, UserProfileSummary } from '../types'

function MemberPicker({
  users,
  selectedIds,
  onToggle,
  disabled,
}: {
  users: UserProfileSummary[]
  selectedIds: number[]
  onToggle: (userId: number) => void
  disabled: boolean
}) {
  if (users.length === 0) {
    return <p className="text-xs text-slate-400">本公司暂无可选成员。</p>
  }
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {users.map((member) => (
        <label
          key={member.userId}
          className="flex items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700"
        >
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            checked={selectedIds.includes(member.userId)}
            onChange={() => onToggle(member.userId)}
            disabled={disabled}
          />
          <span className="min-w-0 flex-1 truncate" title={`${member.name} · ${member.email}`}>
            {member.name}
          </span>
          <span className="shrink-0 text-xs text-slate-400">{member.department || '未填写部门'}</span>
        </label>
      ))}
    </div>
  )
}

/** 业务组配置：为公司创建多个业务组并设置成员，保存后读回一致。 */
export default function GroupsPage() {
  const users = useAsyncData<{ items: UserProfileSummary[] }>(() => apiRequest('/api/users'), [])
  const groups = useAsyncData<{ items: Group[] }>(() => apiRequest('/api/groups'), [])

  const [name, setName] = useState('')
  const [memberIds, setMemberIds] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [formError, setFormError] = useState('')

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editMemberIds, setEditMemberIds] = useState<number[]>([])
  const [editError, setEditError] = useState('')

  const toggleMember = (userId: number) => {
    setMemberIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]))
  }

  const submitCreate = async () => {
    if (!name.trim()) return
    setBusy(true)
    setNotice('')
    setFormError('')
    try {
      await apiRequest('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), memberIds }),
      })
      setNotice(`业务组「${name.trim()}」已创建${memberIds.length > 0 ? `，包含 ${memberIds.length} 名成员` : ''}`)
      setName('')
      setMemberIds([])
      groups.reload()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : '创建失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (group: Group) => {
    setEditingId(group.groupId)
    setEditName(group.name)
    setEditMemberIds(group.members.map((member) => member.userId))
    setEditError('')
  }

  const toggleEditMember = (userId: number) => {
    setEditMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    )
  }

  const submitEdit = async () => {
    if (editingId == null || !editName.trim()) return
    setBusy(true)
    setEditError('')
    setNotice('')
    try {
      await apiRequest(`/api/groups/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editName.trim(), memberIds: editMemberIds }),
      })
      setNotice(`业务组「${editName.trim()}」已更新`)
      setEditingId(null)
      groups.reload()
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : '更新失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  const userList = users.data?.items ?? []
  const groupList = groups.data?.items ?? []

  return (
    <div>
      <PageHeader
        title="业务组配置"
        description="为本公司创建多个业务组并设置成员；成员名单来自本公司用户，保存后读回一致。"
      />

      <section className="card mb-4 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">新建业务组</h2>
        <div className="grid gap-3">
          <div className="flex items-end gap-3">
            <label className="field" style={{ maxWidth: '20rem' }}>
              <span className="label">业务组名称（必填，最多 50 字）</span>
              <input
                className="input"
                maxLength={50}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={busy}
                placeholder="如：技术支持一组"
              />
            </label>
            <button type="button" className="btn" disabled={busy || !name.trim()} onClick={() => void submitCreate()}>
              {busy ? '保存中…' : '创建业务组'}
            </button>
          </div>
          <div>
            <p className="label mb-1.5">成员（可多选，创建后可整体调整）</p>
            <MemberPicker users={userList} selectedIds={memberIds} onToggle={toggleMember} disabled={busy} />
          </div>
        </div>
        {(formError || notice) && (
          <div className="mt-3 space-y-2">
            {notice && <SuccessNotice>{notice}</SuccessNotice>}
            <ErrorNotice error={formError} />
          </div>
        )}
      </section>

      <section className="card">
        <div className="border-b border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-700">本公司业务组（{groupList.length}）</h2>
        </div>
        {groups.loading ? (
          <SkeletonList rows={4} />
        ) : groups.error ? (
          <div className="p-4">
            <ErrorNotice error={groups.error} onRetry={groups.reload} />
          </div>
        ) : groupList.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-600">尚未创建业务组</p>
            <p className="text-xs text-slate-400">先在上方创建第一个业务组，再配置分配规则。</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {groupList.map((group) => (
              <li key={group.groupId} className="p-4">
                {editingId === group.groupId ? (
                  <div className="grid gap-3">
                    <div className="flex items-end gap-3">
                      <label className="field" style={{ maxWidth: '20rem' }}>
                        <span className="label">业务组名称</span>
                        <input
                          className="input"
                          maxLength={50}
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                          disabled={busy}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy || !editName.trim()}
                        onClick={() => void submitEdit()}
                      >
                        {busy ? '保存中…' : '保存'}
                      </button>
                      <button type="button" className="btn-secondary" disabled={busy} onClick={() => setEditingId(null)}>
                        取消
                      </button>
                    </div>
                    <div>
                      <p className="label mb-1.5">成员（保存时整体替换）</p>
                      <MemberPicker
                        users={userList}
                        selectedIds={editMemberIds}
                        onToggle={toggleEditMember}
                        disabled={busy}
                      />
                    </div>
                    <ErrorNotice error={editError} />
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{group.name}</p>
                      <p className="mt-0.5 text-xs text-slate-400">创建于 {formatDateTime(group.createdAt)}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {group.members.length === 0 ? (
                          <span className="text-xs text-slate-400">暂无成员</span>
                        ) : (
                          group.members.map((member) => (
                            <span
                              key={member.userId}
                              className="badge border-slate-200 bg-slate-50 text-slate-600"
                              title={`${member.name} · ${member.email}`}
                            >
                              {member.name}
                              {member.department ? ` · ${member.department}` : ''}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => startEdit(group)}>
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
