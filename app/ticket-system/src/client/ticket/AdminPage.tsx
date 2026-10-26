import { useCallback, useEffect, useState, type FormEvent } from 'react'
import * as api from './api'
import type { AssignmentRule, BusinessGroup, Category } from './types'
import { ErrorCard, SectionCard, Skeleton, useToast } from './ui'

export default function AdminPage() {
  const notify = useToast()
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [rules, setRules] = useState<AssignmentRule[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [groupName, setGroupName] = useState('')
  const [memberUserId, setMemberUserId] = useState<Record<string, string>>({})
  const [ruleCategory, setRuleCategory] = useState('')
  const [ruleGroup, setRuleGroup] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [g, r, c] = await Promise.all([
        api.listBusinessGroups(),
        api.listAssignmentRules(),
        api.getCategories(),
      ])
      setGroups(g.items)
      setRules(r.items)
      setCategories(c.items)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '配置加载失败 / Failed to load config')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const createGroup = async (event: FormEvent) => {
    event.preventDefault()
    if (!groupName.trim()) return
    setBusy(true)
    try {
      await api.createBusinessGroup(groupName.trim())
      setGroupName('')
      notify('业务组已创建 / Group created')
      await load()
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : '创建失败 / Create failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const addMemberTo = async (groupId: string) => {
    const userId = (memberUserId[groupId] ?? '').trim()
    if (!userId) return
    setBusy(true)
    try {
      await api.addMember(groupId, userId)
      setMemberUserId((prev) => ({ ...prev, [groupId]: '' }))
      notify('成员已添加 / Member added')
      await load()
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : '添加失败 / Add failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const removeMemberFrom = async (groupId: string, userId: string) => {
    setBusy(true)
    try {
      await api.removeMember(groupId, userId)
      notify('成员已移除 / Member removed')
      await load()
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : '移除失败 / Remove failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const createRule = async (event: FormEvent) => {
    event.preventDefault()
    if (!ruleCategory || !ruleGroup) return
    setBusy(true)
    try {
      await api.createAssignmentRule(ruleCategory, ruleGroup)
      setRuleCategory('')
      setRuleGroup('')
      notify('规则已创建 / Rule created')
      await load()
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : '创建失败 / Create failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const deleteRule = async (id: string) => {
    if (!confirm('删除该分配规则？ / Delete this rule?')) return
    setBusy(true)
    try {
      await api.deleteAssignmentRule(id)
      notify('规则已删除 / Rule deleted')
      await load()
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : '删除失败 / Delete failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Skeleton lines={4} />
  if (error) return <ErrorCard message={error} onRetry={() => void load()} />

  return (
    <div className="admin-grid">
      <SectionCard title="业务组 / Business groups">
        <form className="form-grid" onSubmit={(e) => void createGroup(e)}>
          <label>业务组名称 / Group name
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} required maxLength={200} />
          </label>
          <div style={{ alignSelf: 'end' }}>
            <button disabled={busy}>添加 / Add</button>
          </div>
        </form>
        {groups.length === 0 ? (
          <p className="subtext">暂无业务组 / No groups</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>名称 / Name</th><th>成员 / Members</th></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id}>
                    <td><strong>{g.name}</strong></td>
                    <td>
                      <div className="row-actions">
                        {g.members.length === 0 ? <span className="subtext">无成员 / No members</span> : null}
                        {g.members.map((m) => (
                          <span key={m.id} className="subtext">
                            {m.name}
                            <button className="secondary" disabled={busy} onClick={() => void removeMemberFrom(g.id, m.id)}>移除</button>
                          </span>
                        ))}
                        <form className="reset-form" onSubmit={(e) => { e.preventDefault(); void addMemberTo(g.id) }}>
                          <input
                            value={memberUserId[g.id] ?? ''}
                            onChange={(e) => setMemberUserId((prev) => ({ ...prev, [g.id]: e.target.value }))}
                            placeholder="用户 ID / User ID"
                          />
                          <button className="secondary" disabled={busy}>添加成员 / Add member</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="分类自动分配规则 / Assignment rules">
        <form className="form-grid" onSubmit={(e) => void createRule(e)}>
          <label>分类 / Category
            <select value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value)} required>
              <option value="">请选择 / Select</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>目标业务组 / Target group
            <select value={ruleGroup} onChange={(e) => setRuleGroup(e.target.value)} required>
              <option value="">请选择 / Select</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <div style={{ alignSelf: 'end' }}>
            <button disabled={busy}>添加规则 / Add rule</button>
          </div>
        </form>
        {rules.length === 0 ? (
          <p className="subtext">暂无规则 / No rules</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>分类 / Category</th><th>目标业务组 / Target group</th><th>操作 / Action</th></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.categoryName}</td>
                    <td>{r.targetGroupName}</td>
                    <td><button className="secondary" disabled={busy} onClick={() => void deleteRule(r.id)}>删除 / Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
