import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { assignmentRulesApi, businessGroupsApi, categoriesApi, companiesApi, usersApi } from '../api/admin'
import { describeApiError } from '../api/errors'
import type { AssignmentRule, BusinessGroup, Category, Company, UserSummary } from '../api/types'
import { EmptyState, Loading, Notice } from '../components/ui'
import { useSession } from '../session'

export default function BusinessGroupsPage() {
  const { profile } = useSession()
  const [companies, setCompanies] = useState<Company[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [users, setUsers] = useState<UserSummary[]>([])
  const [companyId, setCompanyId] = useState('')
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [rules, setRules] = useState<AssignmentRule[]>([])
  const [groupName, setGroupName] = useState('')
  const [ruleForm, setRuleForm] = useState({ categoryId: '', targetGroupId: '' })
  const [memberSelection, setMemberSelection] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([companiesApi.list(), categoriesApi.list(), usersApi.list()])
      .then(([companyResult, categoryResult, userResult]) => {
        setCompanies(companyResult.items)
        setCategories(categoryResult.items)
        setUsers(userResult.items)
        setCompanyId((current) => current || (profile?.companyId ? String(profile.companyId) : ''))
      })
      .catch((cause) => setError(describeApiError(cause, '无法加载基础数据。')))
  }, [profile?.companyId])

  const loadScope = useCallback(async () => {
    if (!companyId) {
      setGroups([])
      setRules([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const [groupResult, ruleResult] = await Promise.all([
        businessGroupsApi.list(Number(companyId)),
        assignmentRulesApi.list(Number(companyId)),
      ])
      setGroups(groupResult.items)
      setRules(ruleResult.items)
    } catch (cause) {
      setGroups([])
      setRules([])
      setError(describeApiError(cause, '无法加载业务组与分配规则。'))
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { void loadScope() }, [loadScope])

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    setError('')
    setFeedback('')
    try {
      await action()
      setFeedback(success)
      await loadScope()
    } catch (cause) {
      setError(describeApiError(cause, '操作失败，请重试。'))
    } finally {
      setBusy(false)
    }
  }

  const createGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!companyId) { setError('请先选择公司。'); return }
    if (!groupName.trim()) { setError('请填写业务组名称。'); return }
    await run(async () => {
      await businessGroupsApi.create({ companyId: Number(companyId), name: groupName.trim() })
      setGroupName('')
    }, '业务组已创建。')
  }

  const addMember = async (event: FormEvent<HTMLFormElement>, group: BusinessGroup) => {
    event.preventDefault()
    const userId = memberSelection[group.id]
    if (!userId) { setError('请选择要加入的成员。'); return }
    await run(() => businessGroupsApi.addMember(group.id, Number(userId)), '成员已添加。')
  }

  const saveRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!companyId) { setError('请先选择公司。'); return }
    if (!ruleForm.categoryId || !ruleForm.targetGroupId) { setError('请选择分类与目标业务组。'); return }
    await run(async () => {
      await assignmentRulesApi.save({ companyId: Number(companyId), categoryId: Number(ruleForm.categoryId), targetGroupId: Number(ruleForm.targetGroupId) })
      setRuleForm({ categoryId: '', targetGroupId: '' })
    }, '分配规则已保存。')
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="section-heading"><h2>业务组管理</h2>
          <label className="search">公司<select value={companyId} onChange={(event) => setCompanyId(event.currentTarget.value)}>
            <option value="">请选择公司</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select></label>
        </div>
        {feedback && <Notice>{feedback}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {!companyId ? <EmptyState>请选择公司后维护业务组、成员与分配规则。</EmptyState> : loading ? <Loading label="加载业务组…" /> : (
          <div className="stack">
            <form className="inline-form" onSubmit={(event) => void createGroup(event)}>
              <label>新增业务组<input value={groupName} onChange={(event) => setGroupName(event.currentTarget.value)} maxLength={200} required /></label>
              <button disabled={busy}>创建业务组</button>
            </form>
            {groups.length === 0 ? <EmptyState>该公司暂无业务组。</EmptyState> : (
              <ul className="group-list">
                {groups.map((group) => (
                  <li key={group.id} className="group-item">
                    <div className="reply-head"><strong>{group.name}</strong><span className="muted">{group.members.length} 名成员</span></div>
                    <div className="member-row">
                      {group.members.length === 0 ? <span className="muted">暂无成员</span> : group.members.map((member) => (
                        <span key={member.userId} className="chip">
                          {member.displayName}
                          <button className="chip-action" disabled={busy} onClick={() => void run(() => businessGroupsApi.removeMember(group.id, member.userId), '成员已移除。')} aria-label={`移除 ${member.displayName}`}>移除</button>
                        </span>
                      ))}
                    </div>
                    <form className="inline-form" onSubmit={(event) => void addMember(event, group)}>
                      <label>添加成员<select value={memberSelection[group.id] ?? ''} onChange={(event) => setMemberSelection({ ...memberSelection, [group.id]: event.currentTarget.value })}>
                        <option value="">请选择用户</option>
                        {users.map((user) => <option key={user.id} value={user.id}>{user.profile.displayName}</option>)}
                      </select></label>
                      <button className="secondary" disabled={busy}>添加</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <h3>分类 → 业务组分配规则</h3>
        {!companyId ? <EmptyState>选择公司后可维护自动分配规则。</EmptyState> : (
          <div className="stack">
            <p className="muted">同一公司内同一分类只保留最新配置；新建工单按分类自动分配到对应业务组，未命中规则时停留在“待分配”。</p>
            <form className="inline-form" onSubmit={(event) => void saveRule(event)}>
              <label>分类<select value={ruleForm.categoryId} onChange={(event) => setRuleForm({ ...ruleForm, categoryId: event.currentTarget.value })}>
                <option value="">请选择分类</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select></label>
              <label>目标业务组<select value={ruleForm.targetGroupId} onChange={(event) => setRuleForm({ ...ruleForm, targetGroupId: event.currentTarget.value })}>
                <option value="">请选择业务组</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select></label>
              <button disabled={busy}>保存规则</button>
            </form>
            {rules.length === 0 ? <EmptyState>暂无分配规则。</EmptyState> : (
              <div className="table-scroll">
                <table>
                  <thead><tr><th>分类</th><th>目标业务组</th></tr></thead>
                  <tbody>{rules.map((rule) => <tr key={rule.id}><td>{rule.categoryName}</td><td>{rule.targetGroupName}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}