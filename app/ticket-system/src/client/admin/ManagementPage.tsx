import { useState, type FormEvent } from 'react'
import { categoryApi, categoryRuleApi, groupApi } from '../platform/api-client'
import { useAsync } from '../platform/hooks'
import type { BusinessGroupMember } from '../platform/types'
import { ErrorBanner, Skeleton, useToast } from '../platform/ui'

export default function ManagementPage() {
  const toast = useToast()
  const groups = useAsync(() => groupApi.list(), [])
  const rules = useAsync(() => categoryRuleApi.list(), [])
  const categories = useAsync(() => categoryApi.list(), [])

  const [groupName, setGroupName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [managingGroup, setManagingGroup] = useState<string | null>(null)
  const [memberInput, setMemberInput] = useState('')

  const [ruleCategoryId, setRuleCategoryId] = useState('')
  const [ruleTargetGroupId, setRuleTargetGroupId] = useState('')

  const reloadAll = async () => {
    await Promise.all([groups.reload(), rules.reload(), categories.reload()])
  }

  const createGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!groupName.trim()) return
    setBusy(true)
    setError('')
    try {
      await groupApi.create(groupName.trim())
      toast.push('业务组已创建 / Group created', 'success')
      setGroupName('')
      await groups.reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败 / Create failed')
    } finally {
      setBusy(false)
    }
  }

  const saveMembers = async (groupId: string) => {
    const memberUserIds = memberInput
      .split(/[\s,，]+/)
      .map((value) => value.trim())
      .filter(Boolean)
    setBusy(true)
    setError('')
    try {
      await groupApi.updateMembers(groupId, memberUserIds)
      toast.push('成员已更新 / Members updated', 'success')
      setManagingGroup(null)
      setMemberInput('')
      await groups.reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新失败 / Update failed')
    } finally {
      setBusy(false)
    }
  }

  const createRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ruleCategoryId || !ruleTargetGroupId) return
    setBusy(true)
    setError('')
    try {
      await categoryRuleApi.create({ categoryId: ruleCategoryId, targetGroupId: ruleTargetGroupId })
      toast.push('规则已创建 / Rule created', 'success')
      setRuleCategoryId('')
      setRuleTargetGroupId('')
      await rules.reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建失败 / Create failed')
    } finally {
      setBusy(false)
    }
  }

  const groupItems = groups.data?.items ?? []
  const ruleItems = rules.data?.items ?? []
  const categoryItems = categories.data?.items ?? []

  return (
    <div className="admin-grid">
      {error && <ErrorBanner message={error} />}

      <section className="card">
        <h2>业务组管理 / Business groups</h2>
        <form className="form-grid" onSubmit={createGroup}>
          <label>业务组名称 / Group name<input value={groupName} onChange={(e) => setGroupName(e.currentTarget.value)} required maxLength={100} /></label>
          <button disabled={busy}>{busy ? '处理中…' : '创建 / Create'}</button>
        </form>

        {groups.loading ? <Skeleton lines={3} /> : groups.error ? <ErrorBanner message={groups.error} /> : groupItems.length === 0 ? (
          <p className="muted">无业务组 / No groups</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>名称</th><th>成员数</th><th>操作</th></tr></thead>
              <tbody>
                {groupItems.map((group) => (
                  <tr key={group.id}>
                    <td><strong>{group.name}</strong></td>
                    <td>{group.memberCount ?? group.members?.length ?? 0}</td>
                    <td>
                      <button className="secondary" onClick={() => { setManagingGroup(group.id); setMemberInput((group.members ?? []).map((m: BusinessGroupMember) => m.userId).join(', ')) }}>
                        管理成员 / Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {managingGroup && (
          <details open>
            <summary>编辑成员 / Edit members</summary>
            <p className="muted">输入成员用户 ID，用逗号或空格分隔。全量替换。/ Enter member user IDs, comma/space separated. Replaces all.</p>
            <form className="stack" onSubmit={(event) => { event.preventDefault(); void saveMembers(managingGroup) }}>
              <textarea value={memberInput} onChange={(e) => setMemberInput(e.currentTarget.value)} rows={3} placeholder="user-id-1, user-id-2" />
              <div className="row-actions">
                <button disabled={busy}>{busy ? '处理中…' : '保存 / Save'}</button>
                <button className="secondary" type="button" onClick={() => { setManagingGroup(null); setMemberInput('') }}>取消 / Cancel</button>
              </div>
            </form>
          </details>
        )}
      </section>

      <section className="card">
        <h2>分类分配规则 / Category assignment rules</h2>
        {categories.error && <ErrorBanner message={categories.error} />}
        <form className="form-grid" onSubmit={createRule}>
          <label>分类 / Category
            <select value={ruleCategoryId} onChange={(e) => setRuleCategoryId(e.currentTarget.value)} required disabled={categories.loading}>
              <option value="">{categories.loading ? '加载中…' : '请选择 / Select…'}</option>
              {categoryItems.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label>目标业务组 / Target group
            <select value={ruleTargetGroupId} onChange={(e) => setRuleTargetGroupId(e.currentTarget.value)} required>
              <option value="">请选择 / Select…</option>
              {groupItems.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
          <button disabled={busy || !ruleCategoryId || !ruleTargetGroupId}>创建规则 / Create rule</button>
        </form>

        {rules.loading ? <Skeleton lines={3} /> : rules.error ? <ErrorBanner message={rules.error} /> : ruleItems.length === 0 ? (
          <p className="muted">无规则 / No rules</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>分类</th><th>目标业务组</th></tr></thead>
              <tbody>
                {ruleItems.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.categoryName ?? rule.categoryId}</td>
                    <td>{rule.targetGroupName ?? rule.targetGroupId}</td>
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
