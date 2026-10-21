import { useState, type FormEvent, type ReactNode } from 'react'
import { useAsyncData, type AsyncHandle } from '../app/useAsyncData'
import { createGroup, createRule, deleteGroup, deleteRule, fetchGroups, fetchRules, fetchUsers, updateGroup } from '../api'
import { CATEGORY_OPTIONS, type AssignmentRule, type Group, type UserBrief } from '../contract'
import { categoryLabel, formatDateTime } from '../labels'
import { describeError } from '../platform/api-client'
import { Card, CategoryChip, DataState, Feedback, Field, type FeedbackMessage } from '../components/ui'

export default function AssignmentPage() {
  const groups = useAsyncData(() => fetchGroups(), [])
  const users = useAsyncData(() => fetchUsers(), [])
  const rules = useAsyncData(() => fetchRules(), [])
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const run = async (name: string, action: () => Promise<void>): Promise<boolean> => {
    setBusy(name)
    setFeedback(null)
    try {
      await action()
      return true
    } catch (cause) {
      setFeedback({ tone: 'error', message: describeError(cause) })
      return false
    } finally {
      setBusy(null)
    }
  }

  const createGroupAction = (name: string, memberIds: number[]) =>
    run('create-group', async () => {
      const group = await createGroup(name, memberIds)
      setFeedback({ tone: 'success', message: `业务组「${group.name}」已创建` })
      groups.reload()
    })

  const updateGroupAction = (groupId: number, payload: { name?: string; memberIds?: number[] }) =>
    run(`update-group-${groupId}`, async () => {
      const group = await updateGroup(groupId, payload)
      setFeedback({ tone: 'success', message: `业务组「${group.name}」已更新` })
      groups.reload()
    })

  const deleteGroupAction = async (group: Group): Promise<void> => {
    await run(`delete-group-${group.id}`, async () => {
      await deleteGroup(group.id)
      setFeedback({ tone: 'success', message: `业务组「${group.name}」已删除` })
      groups.reload()
    })
  }

  const createRuleAction = (category: string, targetGroupId: number) =>
    run('create-rule', async () => {
      const rule = await createRule(category, targetGroupId)
      setFeedback({ tone: 'success', message: `规则已创建：${categoryLabel(category)} → ${rule.targetGroupName}` })
      rules.reload()
    })

  const deleteRuleAction = async (rule: AssignmentRule): Promise<void> => {
    await run(`delete-rule-${rule.id}`, async () => {
      await deleteRule(rule.id)
      setFeedback({ tone: 'success', message: '规则已删除' })
      rules.reload()
    })
  }

  return (
    <AssignmentView
      groups={groups}
      users={users}
      rules={rules}
      feedback={feedback}
      busy={busy}
      onCreateGroup={createGroupAction}
      onUpdateGroup={updateGroupAction}
      onDeleteGroup={deleteGroupAction}
      onCreateRule={createRuleAction}
      onDeleteRule={deleteRuleAction}
    />
  )
}

export interface AssignmentViewProps {
  groups: AsyncHandle<Group[]>
  users: AsyncHandle<UserBrief[]>
  rules: AsyncHandle<AssignmentRule[]>
  feedback: FeedbackMessage | null
  busy: string | null
  onCreateGroup: (name: string, memberIds: number[]) => Promise<boolean>
  onUpdateGroup: (groupId: number, payload: { name?: string; memberIds?: number[] }) => Promise<boolean>
  onDeleteGroup: (group: Group) => Promise<void>
  onCreateRule: (category: string, targetGroupId: number) => Promise<boolean>
  onDeleteRule: (rule: AssignmentRule) => Promise<void>
}

export function AssignmentView(props: AssignmentViewProps) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      {props.feedback !== null && <Feedback tone={props.feedback.tone}>{props.feedback.message}</Feedback>}
      <GroupsCard
        groups={props.groups}
        users={props.users}
        busy={props.busy}
        onCreateGroup={props.onCreateGroup}
        onUpdateGroup={props.onUpdateGroup}
        onDeleteGroup={props.onDeleteGroup}
      />
      <RulesCard
        rules={props.rules}
        groups={props.groups}
        busy={props.busy}
        onCreateRule={props.onCreateRule}
        onDeleteRule={props.onDeleteRule}
      />
    </div>
  )
}

function GroupsCard(props: {
  groups: AsyncHandle<Group[]>
  users: AsyncHandle<UserBrief[]>
  busy: string | null
  onCreateGroup: (name: string, memberIds: number[]) => Promise<boolean>
  onUpdateGroup: (groupId: number, payload: { name?: string; memberIds?: number[] }) => Promise<boolean>
  onDeleteGroup: (group: Group) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [memberIds, setMemberIds] = useState<number[]>([])
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '') return
    const ok = await props.onCreateGroup(trimmed, memberIds)
    if (ok) {
      setName('')
      setMemberIds([])
    }
  }

  return (
    <Card title="业务组与成员">
      <DataState state={props.groups} isEmpty={(data) => data.length === 0} empty="尚未创建业务组；创建业务组并添加成员后，成员即可处理该组工单">
        {(data) => (
          <div className="space-y-3">
            {data.map((group) =>
              editingGroupId === group.id ? (
                <GroupEditForm
                  key={group.id}
                  group={group}
                  users={props.users}
                  busy={props.busy}
                  onSave={(payload) => props.onUpdateGroup(group.id, payload)}
                  onCancel={() => setEditingGroupId(null)}
                />
              ) : (
                <GroupRow
                  key={group.id}
                  group={group}
                  busy={props.busy}
                  onEdit={() => setEditingGroupId(group.id)}
                  onDelete={() => { void props.onDeleteGroup(group) }}
                />
              ),
            )}
          </div>
        )}
      </DataState>
      <form className="mt-4 space-y-3 border-t border-slate-100 pt-4" onSubmit={(event) => { void submitCreate(event) }}>
        <h3 className="text-xs font-semibold text-slate-500">创建业务组</h3>
        <Field label="名称">
          <input
            className="input-base"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            maxLength={100}
            required
            placeholder="业务组名称（1-100 字）"
          />
        </Field>
        <MemberCheckList
          users={props.users}
          selected={memberIds}
          onToggle={(userId) =>
            setMemberIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]))
          }
        />
        <button type="submit" className="btn-primary" disabled={props.busy !== null || name.trim() === ''}>
          {props.busy === 'create-group' ? '创建中…' : '创建业务组'}
        </button>
      </form>
    </Card>
  )
}

function GroupRow(props: { group: Group; busy: string | null; onEdit: () => void; onDelete: () => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const { group } = props
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-800">{group.name}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            创建于 {formatDateTime(group.createdAt)} · {group.members.length} 名成员
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn-secondary" disabled={props.busy !== null} onClick={props.onEdit}>编辑</button>
          {confirmingDelete ? (
            <>
              <button type="button" className="btn-danger" disabled={props.busy !== null} onClick={props.onDelete}>确认删除</button>
              <button type="button" className="btn-secondary" disabled={props.busy !== null} onClick={() => setConfirmingDelete(false)}>再想想</button>
            </>
          ) : (
            <button type="button" className="btn-danger" disabled={props.busy !== null} onClick={() => setConfirmingDelete(true)}>删除</button>
          )}
        </div>
      </div>
      {group.members.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400">暂无成员</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {group.members.map((member) => (
            <span key={member.id} className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {member.displayName}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function GroupEditForm(props: {
  group: Group
  users: AsyncHandle<UserBrief[]>
  busy: string | null
  onSave: (payload: { name?: string; memberIds?: number[] }) => Promise<boolean>
  onCancel: () => void
}) {
  const [name, setName] = useState(props.group.name)
  const [memberIds, setMemberIds] = useState<number[]>(props.group.members.map((member) => member.id))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const ok = await props.onSave({ name: name.trim(), memberIds })
    if (ok) props.onCancel()
  }

  return (
    <form className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3" onSubmit={(event) => { void submit(event) }}>
      <Field label="名称">
        <input className="input-base" value={name} onChange={(event) => setName(event.currentTarget.value)} maxLength={100} required />
      </Field>
      <MemberCheckList
        users={props.users}
        selected={memberIds}
        onToggle={(userId) =>
          setMemberIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]))
        }
      />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={props.busy !== null || name.trim() === ''}>保存</button>
        <button type="button" className="btn-secondary" disabled={props.busy !== null} onClick={props.onCancel}>取消</button>
      </div>
    </form>
  )
}

function MemberCheckList(props: { users: AsyncHandle<UserBrief[]>; selected: number[]; onToggle: (userId: number) => void }) {
  if (props.users.phase === 'loading') return <p className="text-xs text-slate-400">正在加载公司用户…</p>
  if (props.users.phase === 'error') {
    return <p className="text-xs text-red-600">用户列表加载失败：{describeError(props.users.error)}</p>
  }
  if (props.users.data.length === 0) return <p className="text-xs text-slate-400">暂无成员（公司暂无可选用户）</p>
  return (
    <fieldset>
      <legend className="field-label">成员（成员即该组工单的处理人）</legend>
      <div className="mt-1 space-y-1">
        {props.users.data.map((user) => (
          <label key={user.id} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={props.selected.includes(user.id)}
              onChange={() => props.onToggle(user.id)}
            />
            {user.displayName}
            <span className="text-xs text-slate-400">{user.departmentName ?? '未分配部门'}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function RulesCard(props: {
  rules: AsyncHandle<AssignmentRule[]>
  groups: AsyncHandle<Group[]>
  busy: string | null
  onCreateRule: (category: string, targetGroupId: number) => Promise<boolean>
  onDeleteRule: (rule: AssignmentRule) => Promise<void>
}) {
  const [category, setCategory] = useState<string>('')
  const [targetGroupId, setTargetGroupId] = useState<string>('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (category === '' || targetGroupId === '') return
    const ok = await props.onCreateRule(category, Number(targetGroupId))
    if (ok) {
      setCategory('')
      setTargetGroupId('')
    }
  }

  return (
    <Card title="分类自动分配规则">
      <DataState state={props.rules} isEmpty={(data) => data.length === 0} empty="尚未配置规则；配置后该公司新工单将按分类自动进入对应业务组">
        {(data) => (
          <ul className="divide-y divide-slate-100">
            {data.map((rule) => (
              <li key={rule.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <CategoryChip category={rule.category} />
                  <span className="text-slate-400">→</span>
                  <span className="truncate text-slate-700">{rule.targetGroupName}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-slate-400">{formatDateTime(rule.createdAt)}</span>
                  <button type="button" className="btn-danger" disabled={props.busy !== null} onClick={() => { void props.onDeleteRule(rule) }}>
                    删除
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </DataState>
      <form className="mt-4 space-y-3 border-t border-slate-100 pt-4" onSubmit={(event) => { void submit(event) }}>
        <h3 className="text-xs font-semibold text-slate-500">新增规则</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="问题分类" hint="同一分类至多一条规则">
            <select className="input-base" value={category} onChange={(event) => setCategory(event.currentTarget.value)} required>
              <option value="" disabled>选择分类</option>
              {CATEGORY_OPTIONS.map((option) => {
                const occupied = props.rules.phase === 'ready' && props.rules.data.some((rule) => rule.category === option.value)
                return (
                  <option key={option.value} value={option.value} disabled={occupied}>
                    {option.label}
                    {occupied ? '（已有规则）' : ''}
                  </option>
                )
              })}
            </select>
          </Field>
          <Field label="目标业务组">
            <select className="input-base" value={targetGroupId} onChange={(event) => setTargetGroupId(event.currentTarget.value)} required>
              <option value="" disabled>选择业务组</option>
              {props.groups.phase === 'ready'
                ? props.groups.data.map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))
                : null}
            </select>
          </Field>
        </div>
        <button type="submit" className="btn-primary" disabled={props.busy !== null || category === '' || targetGroupId === ''}>
          {props.busy === 'create-rule' ? '创建中…' : '创建规则'}
        </button>
      </form>
    </Card>
  )
}
