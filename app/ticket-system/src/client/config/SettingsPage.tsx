import { useState, type FormEvent } from 'react'
import { apiRequest, readList } from '../platform/api-client'
import { describeError } from '../platform/errors'
import { useApiResource } from '../platform/use-api'
import { useSession } from '../platform/session'
import { EmptyState, ErrorNotice, ForbiddenNotice, LoadingBlock } from '../components/Feedback'
import { formatDate } from '../tickets/format'
import type { AssignmentRule, BusinessGroup, Category } from '../tickets/types'

type ListResponse<T> = T[] | { items: T[] }

export default function SettingsPage() {
  const user = useSession()
  if (user.role !== 'admin') {
    return <ForbiddenNotice hint="业务组、成员与自动分配规则仅由本公司管理员配置。" />
  }
  return <AdminSettings />
}

function AdminSettings() {
  const groups = useApiResource<ListResponse<BusinessGroup>>('/api/groups')
  const rules = useApiResource<ListResponse<AssignmentRule>>('/api/assignment-rules')
  const categories = useApiResource<ListResponse<Category>>('/api/categories')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const groupList = readList(groups.data)
  const ruleList = readList(rules.data)
  const categoryList = readList(categories.data)
  const selectedGroup = groupList.find((group) => group.id === selectedGroupId) ?? groupList[0]

  const refreshAll = () => {
    groups.reload()
    rules.reload()
  }

  const run = async (key: string, action: () => Promise<string>) => {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      setNotice(await action())
      refreshAll()
    } catch (cause) {
      setError(describeError(cause))
    } finally {
      setBusy(null)
    }
  }

  const createGroup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const name = String(new FormData(form).get('name') ?? '').trim()
    if (!name) return
    void run('create-group', async () => {
      const created = await apiRequest<BusinessGroup | { group?: BusinessGroup }>('/api/groups', { method: 'POST', body: JSON.stringify({ name }) })
      const group = 'id' in created ? created as BusinessGroup : (created as { group?: BusinessGroup }).group
      if (group?.id) setSelectedGroupId(group.id)
      form.reset()
      return `业务组「${name}」已创建。`
    })
  }

  const renameGroup = (event: FormEvent<HTMLFormElement>, group: BusinessGroup) => {
    event.preventDefault()
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
    if (!name || name === group.name) return
    void run(`rename-${group.id}`, async () => {
      await apiRequest(`/api/groups/${encodeURIComponent(group.id)}`, { method: 'PATCH', body: JSON.stringify({ name }) })
      return `业务组已更名为「${name}」。`
    })
  }

  const deleteGroup = (group: BusinessGroup) => {
    void run(`delete-group-${group.id}`, async () => {
      await apiRequest(`/api/groups/${encodeURIComponent(group.id)}`, { method: 'DELETE' })
      if (selectedGroup?.id === group.id) setSelectedGroupId('')
      return `业务组「${group.name}」已删除。`
    })
  }

  const addMember = (event: FormEvent<HTMLFormElement>, group: BusinessGroup) => {
    event.preventDefault()
    const form = event.currentTarget
    const userId = String(new FormData(form).get('userId') ?? '').trim()
    if (!userId) return
    void run(`add-member-${group.id}`, async () => {
      await apiRequest(`/api/groups/${encodeURIComponent(group.id)}/members`, { method: 'POST', body: JSON.stringify({ userId }) })
      form.reset()
      return '成员已加入业务组。'
    })
  }

  const removeMember = (group: BusinessGroup, userId: string, name: string) => {
    void run(`remove-member-${group.id}-${userId}`, async () => {
      await apiRequest(`/api/groups/${encodeURIComponent(group.id)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })
      return `已移除成员「${name}」。`
    })
  }

  const createRule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const categoryId = String(data.get('categoryId') ?? '')
    const groupId = String(data.get('groupId') ?? '')
    if (!categoryId || !groupId) return
    void run('create-rule', async () => {
      await apiRequest('/api/assignment-rules', { method: 'POST', body: JSON.stringify({ categoryId, groupId }) })
      form.reset()
      return '分配规则已保存。'
    })
  }

  const updateRule = (rule: AssignmentRule, groupId: string) => {
    if (!groupId || groupId === rule.groupId) return
    void run(`update-rule-${rule.id}`, async () => {
      await apiRequest(`/api/assignment-rules/${encodeURIComponent(rule.id)}`, { method: 'PUT', body: JSON.stringify({ groupId }) })
      return '分配规则已更新。'
    })
  }

  const deleteRule = (rule: AssignmentRule) => {
    void run(`delete-rule-${rule.id}`, async () => {
      await apiRequest(`/api/assignment-rules/${encodeURIComponent(rule.id)}`, { method: 'DELETE' })
      return '分配规则已删除。'
    })
  }

  const configuredCategoryIds = new Set(ruleList.map((rule) => rule.categoryId))
  const availableCategories = categoryList.filter((category) => !configuredCategoryIds.has(category.id))

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>配置</h1>
          <p className="page-hint">维护本公司的业务组、组成员与「问题分类 → 业务组」自动分配规则。</p>
        </div>
      </header>

      {notice && <div className="notice notice-success" role="status">{notice}</div>}
      {error && <div className="notice notice-error" role="alert">{error}</div>}

      <section aria-labelledby="groups-heading">
        <div className="section-heading"><h2 id="groups-heading">业务组</h2></div>
        <div className="settings-layout">
          <div className="card">
            <form className="inline-form" onSubmit={createGroup}>
              <label className="grow">新建业务组
                <input name="name" required maxLength={100} placeholder="例如：一线支持组" />
              </label>
              <button disabled={busy !== null}>{busy === 'create-group' ? '创建中…' : '创建业务组'}</button>
            </form>

            {groups.error ? <ErrorNotice error={groups.error} title="业务组加载失败" onRetry={groups.reload} /> : null}
            {groups.loading && !groups.data
              ? <LoadingBlock label="正在加载业务组…" rows={3} />
              : groupList.length === 0
                ? <EmptyState title="暂无业务组" hint="先创建一个业务组，再添加成员与分配规则。" />
                : <div className="table-scroll">
                  <table className="compact-table">
                    <thead><tr><th>业务组</th><th>成员数</th><th>创建时间</th><th>操作</th></tr></thead>
                    <tbody>{groupList.map((group) => (
                      <tr key={group.id} className={selectedGroup?.id === group.id ? 'selected' : ''}>
                        <td><strong>{group.name}</strong></td>
                        <td>{group.memberCount}</td>
                        <td>{formatDate(group.createdAt)}</td>
                        <td>
                          <div className="row-actions">
                            <button type="button" className="secondary btn-sm" onClick={() => setSelectedGroupId(group.id)}>管理成员</button>
                            <button type="button" className="secondary btn-sm" disabled={busy !== null} onClick={() => deleteGroup(group)}>{busy === `delete-group-${group.id}` ? '删除中…' : '删除'}</button>
                          </div>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>}
          </div>

          <div className="card">
            {selectedGroup
              ? <>
                <div className="section-heading">
                  <h3>「{selectedGroup.name}」成员</h3>
                  <span className="subtext">{selectedGroup.memberCount} 人</span>
                </div>
                <form className="inline-form" key={`rename-${selectedGroup.id}`} onSubmit={(event) => renameGroup(event, selectedGroup)}>
                  <label className="grow">业务组名称
                    <input name="name" defaultValue={selectedGroup.name} required maxLength={100} />
                  </label>
                  <button className="secondary" disabled={busy !== null}>{busy === `rename-${selectedGroup.id}` ? '保存中…' : '保存名称'}</button>
                </form>
                <form className="inline-form" key={`member-${selectedGroup.id}`} onSubmit={(event) => addMember(event, selectedGroup)}>
                  <label className="grow">添加成员
                    <input name="userId" required placeholder="输入本公司用户 ID" />
                  </label>
                  <button disabled={busy !== null}>{busy === `add-member-${selectedGroup.id}` ? '添加中…' : '添加成员'}</button>
                </form>
                <p className="subtext">成员须属于本公司；加入后可查看该业务组承接的工单，移除后立即失去可见性。</p>
                {selectedGroup.members.length === 0
                  ? <EmptyState title="该业务组暂无成员" hint="添加成员后，组内工单会出现在他们的工作台中。" />
                  : <ul className="member-list">
                    {selectedGroup.members.map((member) => (
                      <li key={member.userId}>
                        <div>
                          <strong>{member.name}</strong>
                          <span className="subtext">{member.email} · {member.departmentName}</span>
                        </div>
                        <button type="button" className="secondary btn-sm" disabled={busy !== null} onClick={() => removeMember(selectedGroup, member.userId, member.name)}>
                          {busy === `remove-member-${selectedGroup.id}-${member.userId}` ? '移除中…' : '移除'}
                        </button>
                      </li>
                    ))}
                  </ul>}
              </>
              : <EmptyState title="选择业务组" hint="从左侧选择一个业务组来管理成员与名称。" />}
          </div>
        </div>
      </section>

      <section aria-labelledby="rules-heading">
        <div className="section-heading"><h2 id="rules-heading">自动分配规则</h2></div>
        <div className="card">
          {groupList.length === 0
            ? <EmptyState title="暂无可用业务组" hint="创建业务组后才能配置分配规则。" />
            : <form className="inline-form" onSubmit={createRule}>
              <label className="grow">问题分类
                <select name="categoryId" required defaultValue="" disabled={availableCategories.length === 0}>
                  <option value="" disabled>{availableCategories.length === 0 ? '所有分类均已配置规则' : '请选择问题分类'}</option>
                  {availableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <label className="grow">业务组
                <select name="groupId" required defaultValue="">
                  <option value="" disabled>请选择业务组</option>
                  {groupList.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>
              <button disabled={busy !== null || availableCategories.length === 0}>{busy === 'create-rule' ? '保存中…' : '新增规则'}</button>
            </form>}

          {rules.error ? <ErrorNotice error={rules.error} title="分配规则加载失败" onRetry={rules.reload} /> : null}
          {rules.loading && !rules.data
            ? <LoadingBlock label="正在加载分配规则…" rows={3} />
            : ruleList.length === 0
              ? <EmptyState title="暂无分配规则" hint="命中规则的新工单会自动分配到对应业务组并进入待处理。" />
              : <div className="table-scroll">
                <table className="compact-table">
                  <thead><tr><th>问题分类</th><th>承接业务组</th><th>调整业务组</th><th>操作</th></tr></thead>
                  <tbody>{ruleList.map((rule) => (
                    <tr key={rule.id}>
                      <td><strong>{rule.categoryName}</strong></td>
                      <td>{rule.groupName}</td>
                      <td>
                        <select
                          aria-label={`${rule.categoryName} 的承接业务组`}
                          value={rule.groupId}
                          disabled={busy !== null}
                          onChange={(event) => updateRule(rule, event.currentTarget.value)}
                        >
                          {groupList.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                        </select>
                      </td>
                      <td><button type="button" className="secondary btn-sm" disabled={busy !== null} onClick={() => deleteRule(rule)}>{busy === `delete-rule-${rule.id}` ? '删除中…' : '删除'}</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>}
        </div>
      </section>
    </div>
  )
}
