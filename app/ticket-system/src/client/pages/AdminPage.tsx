/** 管理后台 — 业务组管理 + 分配规则配置（仅 admin） */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { groupApi, ruleApi } from '../platform/ticket-api'
import type { BusinessGroup, AssignmentRule } from '../types'
import {
  Skeleton, EmptyState, ErrorState, formatTime,
} from '../components'
import { PlusIcon, TrashIcon, UsersIcon, SettingsIcon } from '../icons'

interface Props {
  companyId: string
}

export default function AdminPage({ companyId }: Props) {
  // ── 业务组 ──
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [groupLoading, setGroupLoading] = useState(true)
  const [groupError, setGroupError] = useState('')
  const [groupName, setGroupName] = useState('')
  const [groupBusy, setGroupBusy] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [memberInput, setMemberInput] = useState('')
  const [memberError, setMemberError] = useState('')

  // ── 分配规则 ──
  const [rules, setRules] = useState<AssignmentRule[]>([])
  const [ruleLoading, setRuleLoading] = useState(true)
  const [ruleError, setRuleError] = useState('')
  const [ruleCategory, setRuleCategory] = useState('')
  const [ruleTarget, setRuleTarget] = useState('')
  const [ruleBusy, setRuleBusy] = useState(false)
  const [ruleFormError, setRuleFormError] = useState('')

  const loadGroups = useCallback(async () => {
    setGroupLoading(true)
    setGroupError('')
    try {
      const res = await groupApi.list(companyId)
      setGroups(res.items)
    } catch (cause) {
      setGroupError(cause instanceof Error ? cause.message : '加载业务组失败')
    } finally {
      setGroupLoading(false)
    }
  }, [companyId])

  const loadRules = useCallback(async () => {
    setRuleLoading(true)
    setRuleError('')
    try {
      const res = await ruleApi.list()
      setRules(res.items)
    } catch (cause) {
      setRuleError(cause instanceof Error ? cause.message : '加载分配规则失败')
    } finally {
      setRuleLoading(false)
    }
  }, [])

  useEffect(() => { void loadGroups(); void loadRules() }, [loadGroups, loadRules])

  const handleCreateGroup = async (e: FormEvent) => {
    e.preventDefault()
    if (!groupName.trim()) return
    setGroupBusy(true)
    setGroupError('')
    try {
      await groupApi.create(groupName.trim())
      setGroupName('')
      await loadGroups()
    } catch (cause) {
      setGroupError(cause instanceof Error ? cause.message : '创建业务组失败')
    } finally {
      setGroupBusy(false)
    }
  }

  const handleAddMember = async (groupId: string) => {
    if (!memberInput.trim()) return
    setMemberError('')
    try {
      await groupApi.addMember(groupId, memberInput.trim())
      setMemberInput('')
      await loadGroups()
    } catch (cause) {
      setMemberError(cause instanceof Error ? cause.message : '添加成员失败')
    }
  }

  const handleRemoveMember = async (groupId: string, userId: string) => {
    setMemberError('')
    try {
      await groupApi.removeMember(groupId, userId)
      await loadGroups()
    } catch (cause) {
      setMemberError(cause instanceof Error ? cause.message : '移除成员失败')
    }
  }

  const handleCreateRule = async (e: FormEvent) => {
    e.preventDefault()
    if (!ruleCategory.trim() || !ruleTarget) return
    setRuleBusy(true)
    setRuleFormError('')
    try {
      await ruleApi.create(ruleCategory.trim(), ruleTarget)
      setRuleCategory('')
      setRuleTarget('')
      await loadRules()
    } catch (cause) {
      setRuleFormError(cause instanceof Error ? cause.message : '创建规则失败')
    } finally {
      setRuleBusy(false)
    }
  }

  const handleDeleteRule = async (id: string) => {
    setRuleError('')
    try {
      await ruleApi.remove(id)
      await loadRules()
    } catch (cause) {
      setRuleError(cause instanceof Error ? cause.message : '删除规则失败')
    }
  }

  return (
    <div className="admin-page">
      <h2>管理后台</h2>

      {/* 业务组管理 */}
      <section className="card admin-section">
        <div className="section-heading">
          <h3><UsersIcon size={18} /> 业务组管理</h3>
        </div>

        <form className="form-grid inline-form" onSubmit={handleCreateGroup}>
          <label>业务组名称
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} required maxLength={100} placeholder="如：技术支持组" />
          </label>
          <button disabled={groupBusy}>{groupBusy ? '创建中…' : '创建业务组'}</button>
        </form>

        {groupError && <p role="alert" className="error">{groupError}</p>}

        {groupLoading ? (
          <Skeleton className="skeleton-block" />
        ) : groups.length === 0 ? (
          <EmptyState icon={<UsersIcon size={32} />} title="暂无业务组" hint="创建第一个业务组以开始管理成员" />
        ) : (
          <div className="group-list">
            {groups.map((g) => (
              <div key={g.id} className="group-item">
                <div className="group-header" onClick={() => setExpandedGroup(expandedGroup === g.id ? null : g.id)}>
                  <strong>{g.name}</strong>
                  <span className="subtext">{g.memberCount} 成员 · {formatTime(g.createdAt)}</span>
                </div>
                {expandedGroup === g.id && (
                  <div className="group-members">
                    {memberError && <p role="alert" className="error">{memberError}</p>}
                    <div className="member-add">
                      <input
                        value={memberInput}
                        onChange={(e) => setMemberInput(e.target.value)}
                        placeholder="输入用户 ID 添加成员"
                      />
                      <button className="secondary" onClick={() => void handleAddMember(g.id)}>
                        <PlusIcon size={16} /> 添加成员
                      </button>
                    </div>
                    <p className="subtext">业务组成员通过用户 ID 管理</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 分配规则配置 */}
      <section className="card admin-section">
        <div className="section-heading">
          <h3><SettingsIcon size={18} /> 分配规则配置</h3>
        </div>

        <form className="form-grid inline-form" onSubmit={handleCreateRule}>
          <label>问题分类
            <input value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value)} required maxLength={100} placeholder="如：技术问题" />
          </label>
          <label>目标业务组
            <select value={ruleTarget} onChange={(e) => setRuleTarget(e.target.value)} required>
              <option value="">请选择…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <button disabled={ruleBusy || !ruleCategory.trim() || !ruleTarget}>{ruleBusy ? '创建中…' : '创建规则'}</button>
        </form>

        {ruleFormError && <p role="alert" className="error">{ruleFormError}</p>}
        {ruleError && <p role="alert" className="error">{ruleError}</p>}

        {ruleLoading ? (
          <Skeleton className="skeleton-block" />
        ) : rules.length === 0 ? (
          <EmptyState icon={<SettingsIcon size={32} />} title="暂无分配规则" hint="配置规则后工单将按分类自动分配" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>分类</th><th>目标业务组</th><th>创建时间</th><th>操作</th></tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.category}</td>
                    <td>{r.targetGroupName}</td>
                    <td className="subtext">{formatTime(r.createdAt)}</td>
                    <td>
                      <button className="secondary danger-btn" onClick={() => void handleDeleteRule(r.id)}>
                        <TrashIcon size={14} /> 删除
                      </button>
                    </td>
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
