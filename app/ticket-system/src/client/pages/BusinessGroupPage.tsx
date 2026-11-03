import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  businessGroupApi, routingRuleApi, companyApi, userApi,
  type BusinessGroup, type RoutingRule, type UserListItem, type CurrentUser,
} from '../platform/api-client'
import { Spinner, EmptyState, ErrorBanner, SectionCard } from '../components/ui'

export default function BusinessGroupPage({ currentUser }: { currentUser: CurrentUser }) {
  const companyId = currentUser.companyId ?? ''
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [rules, setRules] = useState<RoutingRule[]>([])
  const [users, setUsers] = useState<UserListItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [ruleCategory, setRuleCategory] = useState('')
  const [ruleGroupId, setRuleGroupId] = useState('')
  const [memberUserId, setMemberUserId] = useState('')

  const reload = useCallback(async () => {
    if (!companyId) return
    setLoading(true); setError('')
    try {
      const [g, r, u] = await Promise.all([
        businessGroupApi.list(companyId),
        routingRuleApi.list(companyId),
        userApi.list({ companyId, pageSize: 200 }),
      ])
      setGroups(g.items); setRules(r.items); setUsers(u.items)
      setSelectedId((prev) => (g.items.some((x) => x.id === prev) ? prev : g.items[0]?.id ?? null))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败')
    } finally { setLoading(false) }
  }, [companyId])

  useEffect(() => { void reload() }, [reload])

  const selected = groups.find((g) => g.id === selectedId) ?? null

  const createGroup = async (event: FormEvent) => {
    event.preventDefault()
    if (!groupName.trim() || !companyId) return
    setBusy(true); setError(''); setMessage('')
    try {
      await businessGroupApi.create(companyId, groupName.trim())
      setGroupName('')
      setMessage('业务组已创建')
      await reload()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建失败') }
    finally { setBusy(false) }
  }

  const addMember = async () => {
    if (!selected || !memberUserId) return
    setBusy(true); setError(''); setMessage('')
    try {
      await businessGroupApi.addMember(selected.id, memberUserId)
      setMemberUserId('')
      setMessage('成员已添加')
      await reload()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '添加失败') }
    finally { setBusy(false) }
  }

  const removeMember = async (userId: string) => {
    if (!selected) return
    setBusy(true); setError(''); setMessage('')
    try {
      await businessGroupApi.removeMember(selected.id, userId)
      setMessage('成员已移除')
      await reload()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '移除失败') }
    finally { setBusy(false) }
  }

  const createRule = async (event: FormEvent) => {
    event.preventDefault()
    if (!ruleCategory.trim() || !ruleGroupId || !companyId) return
    setBusy(true); setError(''); setMessage('')
    try {
      await routingRuleApi.create(companyId, ruleCategory.trim(), ruleGroupId)
      setRuleCategory(''); setRuleGroupId('')
      setMessage('路由规则已创建')
      await reload()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建失败') }
    finally { setBusy(false) }
  }

  if (!companyId) return <SectionCard title="业务组管理"><EmptyState message="当前用户未关联公司，无法管理业务组" /></SectionCard>

  return (
    <div className="split-layout">
      <section className="split-list card">
        <SectionCard title="业务组列表" actions={<button className="secondary" disabled={busy} onClick={() => void reload()}>刷新</button>}>
          {loading ? <Spinner /> : groups.length === 0 ? <EmptyState message="暂无业务组" /> : (
            <ul className="ticket-list">
              {groups.map((g) => (
                <li key={g.id} className={g.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(g.id)}>
                  <div className="ticket-row">
                    <strong>{g.name}</strong>
                    <span className="muted">{g.members.length} 名成员</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <form className="form-grid" onSubmit={(e) => void createGroup(e)}>
          <label>新建业务组<input value={groupName} onChange={(e) => setGroupName(e.target.value)} required maxLength={100} placeholder="业务组名称" /></label>
          <button disabled={busy}>创建</button>
        </form>
      </section>

      <section className="split-detail detail-stack">
        {message && <p role="status" className="success">{message}</p>}
        {error && <ErrorBanner message={error} />}
        {!selected ? <EmptyState message="请选择左侧业务组" /> : (
          <>
            <SectionCard title={`${selected.name} · 成员管理`}>
              {selected.members.length === 0 ? <EmptyState message="暂无成员" /> : (
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>成员</th><th>操作</th></tr></thead>
                    <tbody>{selected.members.map((m) => (
                      <tr key={m.userId}><td>{m.userName}</td><td><button className="secondary danger" disabled={busy} onClick={() => void removeMember(m.userId)}>移除</button></td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              <div className="form-grid">
                <label>添加成员<select value={memberUserId} onChange={(e) => setMemberUserId(e.target.value)}>
                  <option value="">选择用户</option>
                  {users.filter((u) => !selected.members.some((m) => m.userId === u.id)).map((u) => <option key={u.id} value={u.id}>{u.name}（{u.email}）</option>)}
                </select></label>
                <button className="secondary" disabled={busy || !memberUserId} onClick={() => void addMember()}>添加成员</button>
              </div>
            </SectionCard>
          </>
        )}

        <SectionCard title="分类路由规则">
          {rules.length === 0 ? <EmptyState message="暂无规则，新建工单将进入待分配状态" /> : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>分类</th><th>目标业务组</th></tr></thead>
                <tbody>{rules.map((r) => (
                  <tr key={r.id}><td>{r.category}</td><td>{r.businessGroupName ?? groups.find((g) => g.id === r.businessGroupId)?.name ?? '—'}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <form className="form-grid" onSubmit={(e) => void createRule(e)}>
            <label>问题分类<input value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value)} required maxLength={100} placeholder="如：账号问题" /></label>
            <label>目标业务组<select value={ruleGroupId} onChange={(e) => setRuleGroupId(e.target.value)} required>
              <option value="">选择业务组</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select></label>
            <button disabled={busy}>添加规则</button>
          </form>
        </SectionCard>
      </section>
    </div>
  )
}
