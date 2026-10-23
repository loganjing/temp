import { useEffect, useState, type FormEvent } from 'react'
import { ticketApi, type BusinessGroup, type AssignmentRule, type AdminUser } from '../api/ticket-api'
import { useToast } from '../components/Toast'

export default function AdminConfig() {
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [rules, setRules] = useState<AssignmentRule[]>([])
  const [allUsers, setAllUsers] = useState<AdminUser[]>([])
  const [groupName, setGroupName] = useState('')
  const [ruleCategory, setRuleCategory] = useState('')
  const [ruleGroupId, setRuleGroupId] = useState('')
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const showToast = useToast()

  const loadAll = async () => {
    setError('')
    try {
      const [groupResult, ruleResult, userResult] = await Promise.all([
        ticketApi.getBusinessGroups(),
        ticketApi.getAssignmentRules(),
        ticketApi.getAdminUsers(),
      ])
      setGroups(groupResult.items)
      setRules(ruleResult.items)
      setAllUsers(userResult.users)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载配置失败')
    }
  }

  useEffect(() => { void loadAll() }, [])

  const createGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!groupName.trim()) return
    setBusy(true)
    try {
      await ticketApi.createBusinessGroup(groupName.trim())
      setGroupName('')
      showToast('业务组已创建')
      await loadAll()
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : '创建失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  const createRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ruleCategory.trim() || !ruleGroupId) return
    setBusy(true)
    try {
      await ticketApi.createAssignmentRule(ruleCategory.trim(), ruleGroupId)
      setRuleCategory('')
      setRuleGroupId('')
      showToast('分配规则已创建')
      await loadAll()
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : '创建失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  const startEditMembers = (group: BusinessGroup) => {
    setEditingGroupId(group.id)
    setSelectedMembers(new Set(group.members.map((m) => m.id)))
  }

  const toggleMember = (userId: string) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const saveMembers = async (groupId: string) => {
    setBusy(true)
    try {
      await ticketApi.setBusinessGroupMembers(groupId, Array.from(selectedMembers))
      showToast('成员已更新')
      setEditingGroupId(null)
      await loadAll()
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : '更新失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  const groupNameById = (id: string) => groups.find((g) => g.id === id)?.name ?? id

  return (
    <div className="admin-grid">
      {error && <p className="error">{error}</p>}

      {/* Create business group */}
      <section className="card">
        <h2 style={{ margin: '0 0 0.75rem' }}>创建业务组</h2>
        <form className="form-grid" onSubmit={(event) => void createGroup(event)}>
          <label>业务组名称<input value={groupName} onChange={(event) => setGroupName(event.currentTarget.value)} required maxLength={200} placeholder="输入业务组名称" /></label>
          <button disabled={busy || !groupName.trim()}>创建</button>
        </form>
      </section>

      {/* Business groups list */}
      <section className="card">
        <h2 style={{ margin: '0 0 0.75rem' }}>业务组列表 ({groups.length})</h2>
        {groups.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>暂无业务组</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>名称</th><th>成员</th><th>操作</th></tr></thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id}>
                    <td><strong>{group.name}</strong></td>
                    <td>
                      {editingGroupId === group.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '200px', overflowY: 'auto' }}>
                          {allUsers.map((u) => (
                            <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                              <input type="checkbox" checked={selectedMembers.has(u.id)} onChange={() => toggleMember(u.id)} style={{ width: 'auto', minHeight: 'auto' }} />
                              {u.name} ({u.email})
                            </label>
                          ))}
                          <div className="row-actions" style={{ marginTop: '0.25rem' }}>
                            <button disabled={busy} onClick={() => void saveMembers(group.id)}>保存</button>
                            <button className="secondary" onClick={() => setEditingGroupId(null)}>取消</button>
                          </div>
                        </div>
                      ) : group.members.length === 0 ? (
                        <span style={{ color: 'var(--muted)' }}>无成员</span>
                      ) : (
                        group.members.map((m) => m.name).join('、')
                      )}
                    </td>
                    <td>
                      {editingGroupId !== group.id && (
                        <button className="secondary" onClick={() => startEditMembers(group)}>设置成员</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create assignment rule */}
      <section className="card">
        <h2 style={{ margin: '0 0 0.75rem' }}>创建分配规则</h2>
        <form className="form-grid" onSubmit={(event) => void createRule(event)}>
          <label>问题分类<input value={ruleCategory} onChange={(event) => setRuleCategory(event.currentTarget.value)} required maxLength={200} placeholder="输入分类名称" /></label>
          <label>业务组
            <select value={ruleGroupId} onChange={(event) => setRuleGroupId(event.currentTarget.value)} required>
              <option value="">请选择…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <button disabled={busy || !ruleCategory.trim() || !ruleGroupId}>创建</button>
        </form>
      </section>

      {/* Assignment rules list */}
      <section className="card">
        <h2 style={{ margin: '0 0 0.75rem' }}>分配规则列表 ({rules.length})</h2>
        {rules.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>暂无分配规则</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>分类</th><th>业务组</th></tr></thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td><strong>{rule.category}</strong></td>
                    <td>{groupNameById(rule.businessGroupId)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
