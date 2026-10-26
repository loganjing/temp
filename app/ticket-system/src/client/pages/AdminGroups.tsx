import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { companyApi, userApi, ApiRequestError } from '../platform/api'

type GroupWithMembers = {
  id: string; company_id: string; name: string; created_at: string
  members: { id: string; user_id: string; user_name: string }[]
}

export default function AdminGroups() {
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [selectedCompany, setSelectedCompany] = useState('')
  const [groups, setGroups] = useState<GroupWithMembers[]>([])
  const [groupName, setGroupName] = useState('')
  const [memberUserId, setMemberUserId] = useState<Record<string, string>>({})
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadCompanies = useCallback(async () => {
    try { const result = await companyApi.list(); setCompanies(result.items); if (result.items[0]) setSelectedCompany(result.items[0].id) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '加载公司失败') }
  }, [])

  const loadUsers = useCallback(async () => {
    try { const result = await userApi.list('', 200, 0); setUsers(result.users) }
    catch { /* ignore */ }
  }, [])

  const loadGroups = useCallback(async () => {
    if (!selectedCompany) return
    try { const result = await companyApi.groups(selectedCompany); setGroups(result.items) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '加载业务组失败') }
  }, [selectedCompany])

  useEffect(() => { void loadCompanies(); void loadUsers() }, [loadCompanies, loadUsers])
  useEffect(() => { void loadGroups() }, [loadGroups])

  const createGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(''); setMessage('')
    if (!selectedCompany || !groupName.trim()) return
    try { await companyApi.createGroup(selectedCompany, groupName.trim()); setGroupName(''); setMessage('业务组已创建'); await loadGroups() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '创建失败') }
  }

  const addMember = async (groupId: string) => {
    setError(''); setMessage('')
    const userId = memberUserId[groupId]
    if (!userId) { setError('请选择用户'); return }
    try { await companyApi.addMember(groupId, userId); setMemberUserId({ ...memberUserId, [groupId]: '' }); setMessage('成员已添加'); await loadGroups() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '添加失败') }
  }

  return (
    <section className="card">
      <h2>业务组管理</h2>
      <div className="form-grid">
        <label>选择公司<select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
      </div>
      <form className="form-grid" style={{ marginTop: '1rem' }} onSubmit={(event) => void createGroup(event)}>
        <label>业务组名称<input value={groupName} onChange={(e) => setGroupName(e.target.value)} required maxLength={200} /></label>
        <button>创建业务组</button>
      </form>
      {message && <p role="status" className="success">{message}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <div style={{ marginTop: '1rem' }}>
        {groups.length === 0 ? <p className="empty">暂无业务组</p> : groups.map((g) => (
          <div key={g.id} className="card" style={{ marginBottom: '0.75rem', padding: '0.85rem' }}>
            <div className="section-heading"><h3>{g.name}</h3><span className="subtext">{g.members.length} 名成员</span></div>
            <div className="table-scroll" style={{ marginTop: '0.5rem' }}>
              <table><thead><tr><th>成员</th></tr></thead><tbody>{g.members.map((m) => <tr key={m.id}><td>{m.user_name}</td></tr>)}</tbody></table>
            </div>
            <div className="row-actions" style={{ marginTop: '0.5rem' }}>
              <select value={memberUserId[g.id] ?? ''} onChange={(e) => setMemberUserId({ ...memberUserId, [g.id]: e.target.value })}>
                <option value="">选择用户添加</option>
                {users.filter((u) => !g.members.some((m) => m.user_id === u.id)).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
              </select>
              <button className="secondary" onClick={() => void addMember(g.id)}>添加成员</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
