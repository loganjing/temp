import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from '../platform/api-client'
import { LoadingView, ErrorView, Toast } from '../components/StateViews'
import type { BusinessGroup } from '../types'

export function BusinessGroupsPage() {
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [memberInputs, setMemberInputs] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await apiRequest<BusinessGroup[]>('/api/business-groups')
      setGroups(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newGroupName.trim()) return
    setBusy(true)
    setActionError('')
    setActionSuccess('')
    try {
      const group = await apiRequest<BusinessGroup>('/api/business-groups', {
        method: 'POST',
        body: JSON.stringify({ name: newGroupName.trim() }),
      })
      setGroups([...groups, group])
      setNewGroupName('')
      setActionSuccess(`业务组「${group.name}」已创建`)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  const handleAddMember = async (groupId: string) => {
    const profileId = memberInputs[groupId]?.trim()
    if (!profileId) return
    setBusy(true)
    setActionError('')
    setActionSuccess('')
    try {
      const member = await apiRequest<{ id: string; groupId: string; profileId: string; displayName: string }>(
        `/api/business-groups/${groupId}/members`,
        { method: 'POST', body: JSON.stringify({ profileId }) },
      )
      setGroups(groups.map((g) => g.id === groupId
        ? { ...g, members: [...g.members, { id: member.id, profileId: member.profileId, displayName: member.displayName, email: '' }], memberCount: g.memberCount + 1 }
        : g,
      ))
      setMemberInputs({ ...memberInputs, [groupId]: '' })
      setActionSuccess(`已添加成员：${member.displayName}`)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '添加失败')
    } finally {
      setBusy(false)
    }
  }

  const handleRemoveMember = async (groupId: string, profileId: string) => {
    setBusy(true)
    setActionError('')
    setActionSuccess('')
    try {
      await apiRequest(`/api/business-groups/${groupId}/members/${profileId}`, { method: 'DELETE' })
      setGroups(groups.map((g) => g.id === groupId
        ? { ...g, members: g.members.filter((m) => m.profileId !== profileId), memberCount: g.memberCount - 1 }
        : g,
      ))
      setActionSuccess('成员已移除')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '移除失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-container">
      <div className="page-header"><h1>业务组管理</h1></div>

      <div className="card form-card">
        <h2>创建业务组</h2>
        <form className="inline-form" onSubmit={(event) => void handleCreate(event)}>
          <input placeholder="业务组名称" value={newGroupName} onChange={(e) => setNewGroupName(e.currentTarget.value)} maxLength={100} />
          <button disabled={busy || !newGroupName.trim()}>创建</button>
        </form>
      </div>

      <Toast message={actionError} type="error" />
      <Toast message={actionSuccess} />

      {loading ? <LoadingView /> :
       error ? <ErrorView message={error} onRetry={load} /> :
       groups.length === 0 ? (
         <div className="card"><p className="muted">暂无业务组，请先创建。</p></div>
       ) : (
        <div className="groups-list">
          {groups.map((group) => (
            <div key={group.id} className="card group-card">
              <div className="group-header" onClick={() => setExpandedId(expandedId === group.id ? null : group.id)}>
                <span className="group-name">{group.name}</span>
                <span className="muted">{group.memberCount} 名成员</span>
                <span className="expand-icon">{expandedId === group.id ? '▾' : '▸'}</span>
              </div>
              {expandedId === group.id && (
                <div className="group-body">
                  <div className="inline-form">
                    <input
                      placeholder="输入 Profile ID 添加成员"
                      value={memberInputs[group.id] ?? ''}
                      onChange={(e) => setMemberInputs({ ...memberInputs, [group.id]: e.currentTarget.value })}
                    />
                    <button disabled={busy || !(memberInputs[group.id]?.trim())} onClick={() => void handleAddMember(group.id)}>添加成员</button>
                  </div>
                  {group.members.length === 0 ? (
                    <p className="muted">暂无成员</p>
                  ) : (
                    <ul className="member-list">
                      {group.members.map((m) => (
                        <li key={m.id} className="member-item">
                          <span>{m.displayName}{m.email && ` · ${m.email}`}</span>
                          <button className="secondary danger-btn" disabled={busy} onClick={() => void handleRemoveMember(group.id, m.profileId)}>移除</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
