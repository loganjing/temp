import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { describeError } from '../platform/api-client'
import { EmptyState, ErrorState, LoadingState, Notice } from '../platform/states'
import {
  createAssignmentRule,
  createGroup,
  deleteAssignmentRule,
  listAssignmentRules,
  listGroups,
  listOrgMembers,
  setGroupMembers,
  updateAssignmentRule,
  updateGroup,
} from '../tickets/api'
import { PERMISSIONS, type AssignmentRule, type BusinessGroup, type BusinessGroupMember, type BusinessGroupSummary, type MeContext, type OrgMember } from '../../shared/contracts'

// 业务组与分配规则：业务组列表与成员编辑，以及“分类 → 业务组”规则表格。
export default function OrgConfigPage({ context }: { context: MeContext }) {
  const canConfigure = context.permissions.includes(PERMISSIONS.ORG_CONFIGURE)
  const [groups, setGroups] = useState<BusinessGroupSummary[]>([])
  const [rules, setRules] = useState<AssignmentRule[]>([])
  const [members, setMembers] = useState<OrgMember[]>([])
  const [knownMembers, setKnownMembers] = useState<Record<string, BusinessGroupMember[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [memberSelection, setMemberSelection] = useState<string[]>([])
  const [newRuleCategory, setNewRuleCategory] = useState('')
  const [newRuleGroupId, setNewRuleGroupId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [groupResult, ruleResult, memberResult] = await Promise.all([
        listGroups(),
        listAssignmentRules(),
        listOrgMembers({ activeOnly: true }),
      ])
      setGroups(groupResult.items)
      setRules(ruleResult.items)
      setMembers(memberResult.items)
    } catch (cause) {
      setError(describeError(cause, '无法加载组织配置 / Could not load organization configuration'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load, refreshKey])

  const remember = (group: BusinessGroup) => setKnownMembers((current) => ({ ...current, [group.id]: group.members }))

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setActionError('')
    setNotice('')
    try {
      await action()
      setRefreshKey((value) => value + 1)
    } catch (cause) {
      setActionError(describeError(cause))
    } finally {
      setBusy(false)
    }
  }

  const submitGroup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newGroupName.trim()) return
    void run(async () => {
      const result = await createGroup({ name: newGroupName.trim(), description: newGroupDescription.trim() || undefined })
      remember(result.group)
      setNewGroupName('')
      setNewGroupDescription('')
      setNotice(`业务组 ${result.group.name} 已创建 / Group created`)
    })
  }

  const submitGroupUpdate = (event: FormEvent<HTMLFormElement>, group: BusinessGroupSummary) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    void run(async () => {
      const result = await updateGroup(group.id, {
        name: String(data.get('name') ?? '').trim(),
        description: String(data.get('description') ?? '').trim(),
      })
      remember(result.group)
      setNotice(`业务组 ${result.group.name} 已更新 / Group updated`)
    })
  }

  const submitMembers = (event: FormEvent<HTMLFormElement>, groupId: string) => {
    event.preventDefault()
    void run(async () => {
      const result = await setGroupMembers(groupId, memberSelection)
      remember(result.group)
      setEditingGroupId(null)
      setNotice(`业务组成员已保存（${result.group.members.length} 人）/ Group members saved`)
    })
  }

  const submitRule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newRuleCategory.trim() || !newRuleGroupId) return
    void run(async () => {
      const result = await createAssignmentRule({ category: newRuleCategory.trim(), groupId: newRuleGroupId })
      setNewRuleCategory('')
      setNewRuleGroupId('')
      setNotice(`规则 ${result.rule.category} → ${result.rule.groupName} 已创建 / Rule created`)
    })
  }

  const submitRuleUpdate = (event: FormEvent<HTMLFormElement>, rule: AssignmentRule) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void run(async () => {
      const result = await updateAssignmentRule(rule.id, {
        category: String(data.get('category') ?? '').trim(),
        groupId: String(data.get('groupId') ?? ''),
      })
      setNotice(`规则 ${result.rule.category} 已更新 / Rule updated`)
    })
  }

  const removeRule = (rule: AssignmentRule) => {
    void run(async () => {
      await deleteAssignmentRule(rule.id)
      setNotice(`规则 ${rule.category} 已删除 / Rule deleted`)
    })
  }

  const openMembers = (groupId: string) => {
    setEditingGroupId(groupId)
    setMemberSelection(knownMembers[groupId]?.map((member) => member.memberId) ?? [])
  }

  const toggleMember = (memberId: string) => {
    setMemberSelection((current) => (current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId]))
  }

  return (
    <div className="page">
      <div className="section-heading">
        <h1>业务组与分配规则 / Groups &amp; assignment rules</h1>
        <span className="subtext">范围：{context.companyName}</span>
      </div>

      <Notice kind="success" text={notice} />
      <Notice kind="error" text={actionError} />
      {!canConfigure && <p className="subtext">当前账号可查看配置但不能修改。/ Read-only for this account.</p>}

      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && (
        <>
          <section className="panel">
            <div className="section-heading"><h2>业务组 / Groups ({groups.length})</h2></div>

            {canConfigure && (
              <form className="form-grid" onSubmit={(event) => void submitGroup(event)}>
                <label>名称 / Name<input value={newGroupName} onChange={(event) => setNewGroupName(event.currentTarget.value)} required maxLength={100} /></label>
                <label>说明（可选）/ Description<input value={newGroupDescription} onChange={(event) => setNewGroupDescription(event.currentTarget.value)} maxLength={500} /></label>
                <button disabled={busy}>新建业务组 / Create group</button>
              </form>
            )}

            {groups.length === 0
              ? <EmptyState message="尚未建立业务组。/ No groups yet." hint="建立业务组后为其配置成员与分类自动分配规则。" />
              : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead><tr><th>名称</th><th>说明</th><th>成员数</th>{canConfigure && <th>操作</th>}</tr></thead>
                    <tbody>
                      {groups.map((group) => (
                        <tr key={group.id}>
                          <td><strong>{group.name}</strong></td>
                          <td title={group.description ?? ''}>{group.description || '—'}</td>
                          <td>{group.memberCount}</td>
                          {canConfigure && (
                            <td>
                              <div className="row-actions row-actions--inline">
                                <button className="secondary" onClick={() => openMembers(group.id)}>{editingGroupId === group.id ? '编辑中 / Editing' : '编辑成员 / Members'}</button>
                                <details className="inline-details">
                                  <summary>重命名 / Rename</summary>
                                  <form className="stack" onSubmit={(event) => void submitGroupUpdate(event, group)}>
                                    <input aria-label="名称 / Name" name="name" defaultValue={group.name} required maxLength={100} />
                                    <input aria-label="说明 / Description" name="description" defaultValue={group.description ?? ''} maxLength={500} />
                                    <button className="secondary" disabled={busy}>保存 / Save</button>
                                  </form>
                                </details>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

            {editingGroupId && canConfigure && (
              <form className="action-form" onSubmit={(event) => void submitMembers(event, editingGroupId)}>
                <div className="section-heading">
                  <h3>编辑成员 / Edit members</h3>
                  <button type="button" className="secondary" onClick={() => setEditingGroupId(null)}>关闭 / Close</button>
                </div>
                <p className="subtext">保存时会整体替换该业务组成员；处理人须为业务组成员，由服务端校验。</p>
                {members.length === 0
                  ? <p className="subtext">本公司暂无可用成员。/ No members available.</p>
                  : (
                    <div className="member-picker">
                      {members.map((member) => (
                        <label key={member.memberId} className="member-option">
                          <input type="checkbox" checked={memberSelection.includes(member.memberId)} onChange={() => toggleMember(member.memberId)} />
                          <span><strong>{member.displayName}</strong><span className="subtext">{member.email}</span></span>
                        </label>
                      ))}
                    </div>
                  )}
                <button disabled={busy}>保存成员 / Save members</button>
                {knownMembers[editingGroupId] && knownMembers[editingGroupId].length > 0 && (
                  <p className="subtext">最近保存的成员：{knownMembers[editingGroupId].map((member) => member.displayName).join('、')}</p>
                )}
              </form>
            )}
          </section>

          <section className="panel">
            <div className="section-heading"><h2>分类自动分配规则 / Assignment rules ({rules.length})</h2></div>

            {canConfigure && (
              <form className="form-grid" onSubmit={(event) => void submitRule(event)}>
                <label>分类 / Category<input value={newRuleCategory} onChange={(event) => setNewRuleCategory(event.currentTarget.value)} required maxLength={50} /></label>
                <label>目标业务组 / Target group
                  <select value={newRuleGroupId} onChange={(event) => setNewRuleGroupId(event.currentTarget.value)} required>
                    <option value="">请选择 / Select</option>
                    {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                </label>
                <button disabled={busy}>新建规则 / Create rule</button>
              </form>
            )}

            {rules.length === 0
              ? <EmptyState message="尚未配置分类自动分配规则。/ No assignment rules yet." hint="配置后，符合该分类的新工单会自动归入目标业务组。" />
              : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead><tr><th>分类</th><th>目标业务组</th><th>更新时间</th>{canConfigure && <th>操作</th>}</tr></thead>
                    <tbody>
                      {rules.map((rule) => (
                        <tr key={rule.id}>
                          <td><strong>{rule.category}</strong></td>
                          <td>{rule.groupName}</td>
                          <td>{rule.updatedAt.slice(0, 16).replace('T', ' ')}</td>
                          {canConfigure && (
                            <td>
                              <div className="row-actions row-actions--inline">
                                <details className="inline-details">
                                  <summary>修改 / Edit</summary>
                                  <form className="stack" onSubmit={(event) => void submitRuleUpdate(event, rule)}>
                                    <input aria-label="分类 / Category" name="category" defaultValue={rule.category} required maxLength={50} />
                                    <select aria-label="目标业务组 / Target group" name="groupId" defaultValue={rule.groupId} required>
                                      {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                                    </select>
                                    <button className="secondary" disabled={busy}>保存 / Save</button>
                                  </form>
                                </details>
                                <details className="inline-details">
                                  <summary>删除 / Delete</summary>
                                  <button className="danger" disabled={busy} onClick={() => removeRule(rule)}>确认删除 / Confirm delete</button>
                                </details>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </section>
        </>
      )}
    </div>
  )
}
