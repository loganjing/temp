import { useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from '../platform/api-client'
import { useBusinessGroups } from '../hooks/useBusinessGroups'
import type { BusinessGroupDTO, DataResponse, MemberDTO } from '../types'

type AdminUser = { id: string; name: string; email: string }

export default function BusinessGroupManagement() {
  const { groups, loading, error, refresh } = useBusinessGroups()
  const [createError, setCreateError] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [memberErrors, setMemberErrors] = useState<Record<string, string>>({})
  const [memberBusy, setMemberBusy] = useState<Record<string, boolean>>({})
  const [users, setUsers] = useState<AdminUser[]>([])

  useEffect(() => {
    void apiRequest<{ users: AdminUser[] }>('/api/admin/users?limit=100&offset=0')
      .then(res => setUsers(res.users))
      .catch(() => {})
  }, [])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    setCreateBusy(true)
    setCreateError('')
    try {
      await apiRequest('/api/business-groups', { method: 'POST', body: JSON.stringify(body) })
      form.reset()
      await refresh()
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : '创建业务组失败')
    } finally {
      setCreateBusy(false)
    }
  }

  const handleAddMember = async (event: FormEvent<HTMLFormElement>, group: BusinessGroupDTO) => {
    event.preventDefault()
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form).entries())
    setMemberBusy(prev => ({ ...prev, [group.id]: true }))
    setMemberErrors(prev => ({ ...prev, [group.id]: '' }))
    try {
      await apiRequest(`/api/business-groups/${encodeURIComponent(group.id)}/members`, {
        method: 'POST', body: JSON.stringify(body),
      })
      form.reset()
      await refresh()
    } catch (cause) {
      setMemberErrors(prev => ({ ...prev, [group.id]: cause instanceof Error ? cause.message : '添加成员失败' }))
    } finally {
      setMemberBusy(prev => ({ ...prev, [group.id]: false }))
    }
  }

  return (
    <main className="shell">
      <div className="admin-page">
        <section className="card">
          <h2>创建业务组</h2>
          <form className="form-grid" onSubmit={(e) => void handleCreate(e)}>
            <label>业务组名称<input name="name" required maxLength={200} /></label>
            <button disabled={createBusy}>{createBusy ? '创建中…' : '创建'}</button>
          </form>
          {createError && <p role="alert" className="error">{createError}</p>}
        </section>

        <section className="card">
          <div className="section-heading"><h2>业务组列表 ({groups.length})</h2></div>
          {loading && <p className="subtext">加载中…</p>}
          {error && <p className="error">{error}</p>}
          {!loading && !error && groups.length === 0 && <p className="subtext">暂无业务组</p>}
          <div className="group-list">
            {groups.map((g: BusinessGroupDTO) => (
              <div key={g.id} className="group-card">
                <div className="group-header">
                  <strong>{g.name}</strong>
                  <span className="subtext">{g.members.length} 名成员 · {new Date(g.createdAt).toLocaleDateString()}</span>
                </div>
                {g.members.length > 0 ? (
                  <ul className="member-list">
                    {g.members.map((m: MemberDTO) => (
                      <li key={m.id}>{m.userName} <span className="subtext">{m.email}</span></li>
                    ))}
                  </ul>
                ) : <p className="subtext">暂无成员</p>}
                <form className="add-member-form" onSubmit={(e) => void handleAddMember(e, g)}>
                  <select name="userId" required defaultValue="">
                    <option value="">— 选择用户 —</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                    ))}
                  </select>
                  <button className="secondary" disabled={memberBusy[g.id]}>添加成员</button>
                </form>
                {memberErrors[g.id] && <p className="error">{memberErrors[g.id]}</p>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
