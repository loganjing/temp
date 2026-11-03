import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { listCompanies, listGroups, createGroup, listMembers, addMember, removeMember, listUsers } from '../api/org-api'
import type { Company, BusinessGroup, GroupMember, UserItem } from '../api/types'
import { Loading, EmptyState, ErrorState } from '../components/States'
import { ToastProvider, useToast } from '../components/Toast'
import { formatDateTime } from '../components/format'

function BusinessGroupsInner() {
  const toast = useToast()
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [members, setMembers] = useState<GroupMember[]>([])
  const [users, setUsers] = useState<UserItem[]>([])
  const [groupName, setGroupName] = useState('')
  const [memberUserId, setMemberUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void listCompanies().then((cs) => {
      setCompanies(cs)
      if (cs.length > 0) setSelectedCompanyId(cs[0].id)
    }).catch((cause) => setError(cause instanceof Error ? cause.message : '加载公司失败'))
  }, [])

  useEffect(() => {
    void listUsers().then(setUsers).catch(() => {})
  }, [])

  const loadGroups = useCallback(async () => {
    if (!selectedCompanyId) { setGroups([]); return }
    setLoading(true)
    setError('')
    try {
      setGroups(await listGroups(selectedCompanyId))
      setSelectedGroupId('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载业务组失败')
    } finally {
      setLoading(false)
    }
  }, [selectedCompanyId])

  const loadMembers = useCallback(async () => {
    if (!selectedCompanyId || !selectedGroupId) { setMembers([]); return }
    try {
      setMembers(await listMembers(selectedCompanyId, selectedGroupId))
    } catch (cause) {
      toast('error', cause instanceof Error ? cause.message : '加载成员失败')
    }
  }, [selectedCompanyId, selectedGroupId, toast])

  useEffect(() => { void loadGroups() }, [loadGroups])
  useEffect(() => { void loadMembers() }, [loadMembers])

  const doCreateGroup = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedCompanyId || !groupName.trim()) return
    setBusy(true)
    try {
      await createGroup(selectedCompanyId, groupName.trim())
      setGroupName('')
      toast('success', '业务组已创建')
      await loadGroups()
    } catch (cause) {
      toast('error', cause instanceof Error ? cause.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  const doAddMember = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedCompanyId || !selectedGroupId || !memberUserId) return
    setBusy(true)
    try {
      await addMember(selectedCompanyId, selectedGroupId, memberUserId)
      setMemberUserId('')
      toast('success', '成员已添加')
      await loadMembers()
      await loadGroups()
    } catch (cause) {
      toast('error', cause instanceof Error ? cause.message : '添加成员失败')
    } finally {
      setBusy(false)
    }
  }

  const doRemoveMember = async (userId: string) => {
    if (!selectedCompanyId || !selectedGroupId) return
    setBusy(true)
    try {
      await removeMember(selectedCompanyId, selectedGroupId, userId)
      toast('success', '成员已移除')
      await loadMembers()
      await loadGroups()
    } catch (cause) {
      toast('error', cause instanceof Error ? cause.message : '移除成员失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="groups-page">
      <div className="filter-bar">
        <label className="filter-item">
          <span>公司</span>
          <select value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>

      <div className="groups-grid">
        <section className="card">
          <h3>业务组列表</h3>
          <form className="inline-form" onSubmit={(e) => void doCreateGroup(e)}>
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="业务组名称" required maxLength={100} />
            <button disabled={busy || !selectedCompanyId}>创建</button>
          </form>
          {loading ? <Loading /> : error ? <ErrorState message={error} /> : groups.length === 0 ? <EmptyState message="暂无业务组" /> : (
            <div className="group-list">
              {groups.map((g) => (
                <button key={g.id} className={`group-row${selectedGroupId === g.id ? ' selected' : ''}`} onClick={() => setSelectedGroupId(g.id)}>
                  <span>{g.name}</span>
                  <span className="subtext">{g.memberCount} 成员</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h3>成员管理{groups.find((g) => g.id === selectedGroupId) ? ` · ${groups.find((g) => g.id === selectedGroupId)!.name}` : ''}</h3>
          {!selectedGroupId ? <EmptyState message="请选择左侧业务组" /> : (
            <>
              <form className="inline-form" onSubmit={(e) => void doAddMember(e)}>
                <select value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)} required>
                  <option value="">选择用户</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.fullName} · {u.email}</option>)}
                </select>
                <button disabled={busy}>添加成员</button>
              </form>
              {members.length === 0 ? <EmptyState message="暂无成员" /> : (
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>姓名</th><th>邮箱</th><th>加入时间</th><th>操作</th></tr></thead>
                    <tbody>{members.map((m) => (
                      <tr key={m.id}>
                        <td>{m.fullName}</td>
                        <td>{m.email}</td>
                        <td>{formatDateTime(m.createdAt)}</td>
                        <td><button className="secondary danger-btn" disabled={busy} onClick={() => void doRemoveMember(m.userId)}>移除</button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

export default function BusinessGroupsPage() {
  return (
    <ToastProvider>
      <BusinessGroupsInner />
    </ToastProvider>
  )
}
