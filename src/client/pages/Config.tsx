import { useState, useCallback, useEffect } from 'react'
import { listBusinessGroups, createBusinessGroup, setGroupMembers, listAssignmentRules, createAssignmentRule, updateAssignmentRule } from '../api'
import type { BusinessGroup, AssignmentRule } from '../api/types'
import { useSession } from '../hooks/useSession'
import { Loading, EmptyState, ErrorState, Alert, Modal } from '../components/common'
import { FetchError } from '../api/client'

export default function Config() {
  const { session } = useSession()
  const canConfig = session?.capabilities.includes('configure_assignment')

  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [rules, setRules] = useState<AssignmentRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [showNewRule, setShowNewRule] = useState(false)
  const [showMembers, setShowMembers] = useState<BusinessGroup | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [g, r] = await Promise.all([listBusinessGroups(), listAssignmentRules()])
      setGroups(g.items)
      setRules(r.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const showMsg = (msg: string) => { setActionMsg(msg); setTimeout(() => setActionMsg(null), 3000) }

  const handleCreateGroup = async (name: string) => {
    try {
      const resp = await createBusinessGroup(name)
      setGroups([...groups, resp.group])
      setShowNewGroup(false)
      showMsg('业务组创建成功')
    } catch (e) {
      if (e instanceof FetchError) setActionError(e.message)
      else setActionError('创建失败')
      setTimeout(() => setActionError(null), 3000)
    }
  }

  const handleSetMembers = async (groupId: string, memberIds: string[]) => {
    try {
      const resp = await setGroupMembers(groupId, memberIds)
      setGroups(groups.map(g => g.id === groupId ? resp.group : g))
      setShowMembers(null)
      showMsg('成员设置成功')
    } catch (e) {
      if (e instanceof FetchError) {
        if (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN') throw new Error('资源不存在或不可见')
        throw new Error(e.message)
      }
      throw new Error('设置失败')
    }
  }

  const handleCreateRule = async (category: string, groupId: string, enabled: boolean) => {
    try {
      const resp = await createAssignmentRule({ category, groupId, enabled })
      setRules([...rules, resp.rule])
      setShowNewRule(false)
      showMsg('规则创建成功')
    } catch (e) {
      if (e instanceof FetchError) {
        if (e.code === 'DUPLICATE_RULE') throw new Error('同一公司同一分类已存在启用规则')
        if (e.code === 'FORBIDDEN') throw new Error('资源不存在或不可见')
        throw new Error(e.message)
      }
      throw new Error('创建失败')
    }
  }

  const handleUpdateRule = async (id: string, data: { enabled?: boolean }) => {
    try {
      const resp = await updateAssignmentRule(id, data)
      setRules(rules.map(r => r.id === id ? resp.rule : r))
      showMsg('规则更新成功')
    } catch (e) {
      if (e instanceof FetchError) {
        if (e.code === 'DUPLICATE_RULE') setActionError('同一公司同一分类已存在启用规则')
        else if (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN') setActionError('资源不存在或不可见')
        else setActionError(e.message)
      } else setActionError('更新失败')
      setTimeout(() => setActionError(null), 3000)
    }
  }

  if (loading) return <Loading />
  if (error) return <ErrorState message={error} onRetry={fetchData} />

  return (
    <div>
      <div className="page-header">
        <div className="page-title">业务组与分配规则配置</div>
      </div>

      {!canConfig && <Alert type="warning">当前身份无配置权限</Alert>}
      {actionMsg && <Alert type="success">{actionMsg}</Alert>}
      {actionError && <Alert type="error">{actionError}</Alert>}

      {/* Business Groups */}
      <div className="card mb-24">
        <div className="card-header">
          <span className="card-title">业务组 ({groups.length})</span>
          {canConfig && <button className="btn btn-primary btn-sm" onClick={() => setShowNewGroup(true)}>新增业务组</button>}
        </div>
        <div className="card-body">
          {groups.length === 0 ? <EmptyState text="暂无业务组" hint="新增业务组以配置分配" /> : (
            <table className="table">
              <thead><tr><th>名称</th><th>成员</th><th>操作</th></tr></thead>
              <tbody>
                {groups.map(g => (
                  <tr key={g.id}>
                    <td>{g.name}</td>
                    <td className="text-secondary">{g.members.map(m => m.name).join(', ') || '无'}</td>
                    <td>
                      {canConfig && (
                        <button className="btn btn-link btn-sm" onClick={() => setShowMembers(g)}>设置成员</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Assignment Rules */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">分配规则 ({rules.length})</span>
          {canConfig && <button className="btn btn-primary btn-sm" onClick={() => setShowNewRule(true)}>新增规则</button>}
        </div>
        <div className="card-body">
          {rules.length === 0 ? <EmptyState text="暂无分配规则" hint="配置分类→业务组规则以启用自动分配" /> : (
            <table className="table">
              <thead><tr><th>分类</th><th>目标业务组</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id}>
                    <td>{r.category}</td>
                    <td>{r.groupName}</td>
                    <td>{r.enabled ? <span className="badge badge-completed">启用</span> : <span className="badge badge-cancelled">停用</span>}</td>
                    <td>
                      {canConfig && (
                        <button className="btn btn-link btn-sm" onClick={() => handleUpdateRule(r.id, { enabled: !r.enabled })}>
                          {r.enabled ? '停用' : '启用'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showNewGroup && (
        <NewGroupModal onClose={() => setShowNewGroup(false)} onSubmit={handleCreateGroup} />
      )}
      {showNewRule && (
        <NewRuleModal groups={groups} onClose={() => setShowNewRule(false)} onSubmit={handleCreateRule} />
      )}
      {showMembers && (
        <MembersModal group={showMembers} onClose={() => setShowMembers(null)} onSubmit={handleSetMembers} />
      )}
    </div>
  )
}

function NewGroupModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (name: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) { setError('请输入名称'); return }
    setSubmitting(true); setError(null)
    try { await onSubmit(name.trim()) }
    catch (e) { setError(e instanceof Error ? e.message : '创建失败') }
    finally { setSubmitting(false) }
  }

  return (
    <Modal title="新增业务组" onClose={onClose} footer={
      <><button className="btn btn-secondary" onClick={onClose}>取消</button>
      <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>{submitting ? '创建中...' : '创建'}</button></>
    }>
      {error && <Alert type="error">{error}</Alert>}
      <div className="form-group">
        <label className="form-label">名称<span className="required">*</span></label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} maxLength={64} autoFocus />
      </div>
    </Modal>
  )
}

function NewRuleModal({ groups, onClose, onSubmit }: { groups: BusinessGroup[]; onClose: () => void; onSubmit: (category: string, groupId: string, enabled: boolean) => Promise<void> }) {
  const [category, setCategory] = useState('')
  const [groupId, setGroupId] = useState(groups[0]?.id || '')
  const [enabled, setEnabled] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!category.trim()) { setError('请输入分类'); return }
    if (!groupId) { setError('请选择业务组'); return }
    setSubmitting(true); setError(null)
    try { await onSubmit(category.trim(), groupId, enabled) }
    catch (e) { setError(e instanceof Error ? e.message : '创建失败') }
    finally { setSubmitting(false) }
  }

  return (
    <Modal title="新增分配规则" onClose={onClose} footer={
      <><button className="btn btn-secondary" onClick={onClose}>取消</button>
      <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>{submitting ? '创建中...' : '创建'}</button></>
    }>
      {error && <Alert type="error">{error}</Alert>}
      <div className="form-group">
        <label className="form-label">问题分类<span className="required">*</span></label>
        <input className="form-input" value={category} onChange={e => setCategory(e.target.value)} maxLength={64} autoFocus />
      </div>
      <div className="form-group">
        <label className="form-label">目标业务组<span className="required">*</span></label>
        <select className="form-select" value={groupId} onChange={e => setGroupId(e.target.value)}>
          <option value="">请选择</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="checkbox-item">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> 启用
        </label>
      </div>
    </Modal>
  )
}

function MembersModal({ group, onClose, onSubmit }: { group: BusinessGroup; onClose: () => void; onSubmit: (groupId: string, memberIds: string[]) => Promise<void> }) {
  const [memberIds, setMemberIds] = useState<string[]>(group.members.map(m => m.id))
  const [newMemberId, setNewMemberId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleAdd = () => {
    const id = newMemberId.trim()
    if (id && !memberIds.includes(id)) {
      setMemberIds([...memberIds, id])
      setNewMemberId('')
    }
  }

  const handleRemove = (id: string) => {
    setMemberIds(memberIds.filter(m => m !== id))
  }

  const handleSubmit = async () => {
    setSubmitting(true); setError(null)
    try { await onSubmit(group.id, memberIds) }
    catch (e) { setError(e instanceof Error ? e.message : '设置失败') }
    finally { setSubmitting(false) }
  }

  return (
    <Modal title={`设置成员 - ${group.name}`} onClose={onClose} footer={
      <><button className="btn btn-secondary" onClick={onClose}>取消</button>
      <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>{submitting ? '保存中...' : '保存'}</button></>
    }>
      {error && <Alert type="error">{error}</Alert>}
      <div className="form-group">
        <label className="form-label">当前成员</label>
        {memberIds.length === 0 ? <div className="text-muted">无成员</div> : (
          <div className="checkbox-list">
            {memberIds.map(id => (
              <div key={id} className="checkbox-item">
                <span className="flex-1">{id}</span>
                <button className="btn btn-link btn-sm" onClick={() => handleRemove(id)}>移除</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="form-group">
        <label className="form-label">添加成员（输入用户 ID）</label>
        <div className="flex gap-8">
          <input className="form-input" value={newMemberId} onChange={e => setNewMemberId(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} placeholder="用户 ID" />
          <button className="btn btn-secondary" onClick={handleAdd}>添加</button>
        </div>
      </div>
    </Modal>
  )
}
