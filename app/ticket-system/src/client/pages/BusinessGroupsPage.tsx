import { useState, type FormEvent } from 'react'
import { apiRequest } from '../platform/api-client'
import { useAsync } from '../hooks/useAsync'
import { Skeleton, EmptyState, ErrorState, useSuccessToast } from '../components/StateViews'
import type { AssignmentRule, BusinessGroup, GroupMember } from '../types/ticket'

// 业务组管理：业务组列表、成员管理（添加/移除）、分类分配规则配置。
export default function BusinessGroupsPage() {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const { message: toast, notify } = useSuccessToast()

  const groupsState = useAsync<BusinessGroup[]>(() => apiRequest('/api/business-groups'), [])
  const membersState = useAsync<GroupMember[]>(
    () => selectedGroupId
      ? apiRequest(`/api/business-groups/${encodeURIComponent(selectedGroupId)}/members`)
      : Promise.resolve([]),
    [selectedGroupId],
  )
  const rulesState = useAsync<AssignmentRule[]>(() => apiRequest('/api/assignment-rules'), [])

  const refreshAll = () => {
    void groupsState.reload()
    void membersState.reload()
    void rulesState.reload()
  }

  return (
    <div className="flex flex-col gap-4">
      {toast && <p role="status" className="success">{toast}</p>}

      <CreateGroupForm onCreated={() => { notify('业务组已创建'); void groupsState.reload() }} />

      <section className="card">
        <div className="section-heading"><h2>业务组列表</h2></div>
        {groupsState.loading && <Skeleton lines={3} />}
        {groupsState.error && <ErrorState message={groupsState.error} onRetry={groupsState.reload} />}
        {!groupsState.loading && !groupsState.error && groupsState.data && groupsState.data.length === 0 && (
          <EmptyState title="暂无业务组" hint="先创建业务组再管理成员与分配规则。" />
        )}
        {groupsState.data && groupsState.data.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>名称</th><th>创建时间</th><th>操作</th></tr></thead>
              <tbody>{groupsState.data.map((group) => (
                <tr key={group.id}>
                  <td><strong>{group.name}</strong></td>
                  <td>{new Date(group.created_at).toLocaleString()}</td>
                  <td>
                    <button className="secondary" onClick={() => setSelectedGroupId(group.id)}>
                      {selectedGroupId === group.id ? '当前选中' : '管理成员'}
                    </button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      {selectedGroupId && (
        <MembersPanel
          groupId={selectedGroupId}
          members={membersState.data ?? []}
          loading={membersState.loading}
          error={membersState.error}
          onReload={membersState.reload}
          onAdded={() => { notify('成员已添加'); void membersState.reload() }}
          onRemoved={() => { notify('成员已移除'); void membersState.reload() }}
        />
      )}

      <AssignmentRulesPanel rules={rulesState.data ?? []} loading={rulesState.loading} error={rulesState.error} onReload={rulesState.reload} onCreated={refreshAll} />
    </div>
  )
}

function CreateGroupForm({ onCreated }: { onCreated: () => void }) {
  const [companyId, setCompanyId] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await apiRequest('/api/business-groups', { method: 'POST', body: JSON.stringify({ company_id: companyId, name }) })
      setName('')
      onCreated()
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <div className="section-heading"><h2>创建业务组</h2></div>
      <form className="form-grid" onSubmit={(event) => void submit(event)}>
        <label>公司 ID<input value={companyId} onChange={(e) => setCompanyId(e.currentTarget.value)} required /></label>
        <label>业务组名称<input value={name} onChange={(e) => setName(e.currentTarget.value)} required maxLength={100} /></label>
        <div className="flex items-end"><button disabled={busy}>{busy ? '提交中…' : '创建'}</button></div>
      </form>
      {err && <p role="alert" className="error mt-2">{err}</p>}
    </section>
  )
}

interface MembersPanelProps {
  groupId: string
  members: GroupMember[]
  loading: boolean
  error: string | undefined
  onReload: () => void
  onAdded: () => void
  onRemoved: () => void
}

function MembersPanel({ groupId, members, loading, error, onReload, onAdded, onRemoved }: MembersPanelProps) {
  const [userId, setUserId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const add = async () => {
    if (!userId.trim()) return
    setBusy(true)
    setErr('')
    try {
      await apiRequest(`/api/business-groups/${encodeURIComponent(groupId)}/members`, {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      })
      setUserId('')
      onAdded()
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : '添加失败')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (member: GroupMember) => {
    setErr('')
    try {
      await apiRequest(`/api/business-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(member.user_id)}`, { method: 'DELETE' })
      onRemoved()
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : '移除失败')
    }
  }

  return (
    <section className="card">
      <div className="section-heading"><h2>成员管理</h2></div>
      <div className="form-grid">
        <label>用户 ID<input value={userId} onChange={(e) => setUserId(e.currentTarget.value)} /></label>
        <div className="flex items-end"><button disabled={busy || !userId.trim()} onClick={() => void add()}>添加成员</button></div>
      </div>
      {err && <p role="alert" className="error mt-2">{err}</p>}
      <div className="mt-3">
        {loading && <Skeleton lines={3} />}
        {error && <ErrorState message={error} onRetry={onReload} />}
        {!loading && !error && members.length === 0 && <EmptyState title="该业务组暂无成员" />}
        {members.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>成员用户 ID</th><th>加入时间</th><th>操作</th></tr></thead>
              <tbody>{members.map((member) => (
                <tr key={member.id}>
                  <td title={member.user_id}>{member.user_id}</td>
                  <td>{new Date(member.created_at).toLocaleString()}</td>
                  <td><button className="secondary" onClick={() => void remove(member)}>移除</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

interface AssignmentRulesPanelProps {
  rules: AssignmentRule[]
  loading: boolean
  error: string | undefined
  onReload: () => void
  onCreated: () => void
}

function AssignmentRulesPanel({ rules, loading, error, onReload, onCreated }: AssignmentRulesPanelProps) {
  const [companyId, setCompanyId] = useState('')
  const [category, setCategory] = useState('')
  const [groupId, setGroupId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const groupsState = useAsync<BusinessGroup[]>(() => apiRequest('/api/business-groups'), [])

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await apiRequest('/api/assignment-rules', {
        method: 'POST',
        body: JSON.stringify({ company_id: companyId, category, business_group_id: groupId }),
      })
      setCompanyId(''); setCategory(''); setGroupId('')
      onCreated()
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (rule: AssignmentRule) => {
    setErr('')
    try {
      await apiRequest(`/api/assignment-rules/${encodeURIComponent(rule.id)}`, { method: 'DELETE' })
      onCreated()
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : '删除失败')
    }
  }

  return (
    <section className="card">
      <div className="section-heading"><h2>分类自动分配规则</h2></div>
      <form className="form-grid" onSubmit={(event) => void create(event)}>
        <label>公司 ID<input value={companyId} onChange={(e) => setCompanyId(e.currentTarget.value)} required /></label>
        <label>分类<input value={category} onChange={(e) => setCategory(e.currentTarget.value)} required /></label>
        <label>目标业务组
          <select value={groupId} onChange={(e) => setGroupId(e.currentTarget.value)} required>
            <option value="">请选择</option>
            {(groupsState.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <div className="flex items-end"><button disabled={busy}>{busy ? '提交中…' : '创建规则'}</button></div>
      </form>
      {err && <p role="alert" className="error mt-2">{err}</p>}
      <div className="mt-3">
        {loading && <Skeleton lines={3} />}
        {error && <ErrorState message={error} onRetry={onReload} />}
        {!loading && !error && rules.length === 0 && <EmptyState title="暂无分配规则" />}
        {rules.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>分类</th><th>目标业务组</th><th>创建时间</th><th>操作</th></tr></thead>
              <tbody>{rules.map((rule) => {
                const group = groupsState.data?.find((g) => g.id === rule.business_group_id)
                return (
                  <tr key={rule.id}>
                    <td>{rule.category}</td>
                    <td>{group?.name ?? rule.business_group_id}</td>
                    <td>{new Date(rule.created_at).toLocaleString()}</td>
                    <td><button className="secondary" onClick={() => void remove(rule)}>删除</button></td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
