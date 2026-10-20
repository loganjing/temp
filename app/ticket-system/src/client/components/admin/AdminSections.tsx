// 管理页区块（仅 ops 使用）：公司、用户档案、业务组与成员、分配规则。
// 端点与字段严格按契约第 5、6 节；错误码经统一文案映射。

import { useCallback, useEffect, useState } from 'react'
import {
  addGroupMember,
  createBusinessGroup,
  createCompany,
  createUser,
  deleteAssignmentRule,
  deleteBusinessGroup,
  listAssignmentRules,
  listBusinessGroups,
  listCompanies,
  listUsers,
  removeGroupMember,
  renameBusinessGroup,
  upsertAssignmentRule,
  updateUser,
} from '../../api'
import { describeApiError } from '../../platform/api-client'
import { BASELINE_CATEGORIES, type AdminUser, type AssignmentRule, type BusinessGroup, type Company, type Role } from '../../contracts'
import { formatDateTime } from '../../format'
import { useCompanyDirectory } from '../../state/company-directory'
import { EmptyBlock, ErrorBlock, LoadingBlock, Notice, RoleBadge } from '../ui'
import { IconPlus, IconTrash, IconUser, IconUsers, IconX } from '../icons'

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: 'submitter', label: '提交人' },
  { value: 'handler', label: '处理人' },
  { value: 'ops', label: '运营' },
]

// —— 公司管理 ——————————————————————————————————————

export function CompaniesSection() {
  const { refresh } = useCompanyDirectory()
  const [companies, setCompanies] = useState<Company[]>([])
  const [name, setName] = useState('')
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setListError('')
    try {
      const { items } = await listCompanies()
      setCompanies(items)
    } catch (cause) {
      setListError(describeApiError(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async () => {
    if (!name.trim()) {
      setNotice({ kind: 'error', text: '请填写公司名称' })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      await createCompany({ name: name.trim() })
      setName('')
      setNotice({ kind: 'success', text: '公司已创建' })
      refresh()
      await load()
    } catch (cause) {
      setNotice({ kind: 'error', text: describeApiError(cause) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold">公司管理</h2>
      <div className="mt-3 flex gap-2">
        <input
          className="input"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          placeholder="新公司名称（1–100 字）"
          maxLength={100}
          aria-label="新公司名称"
        />
        <button type="button" className="btn btn-primary shrink-0" onClick={() => void submit()} disabled={busy}>
          <IconPlus size={14} />
          创建公司
        </button>
      </div>
      {notice && <div className="mt-3">{<Notice kind={notice.kind} text={notice.text} />}</div>}
      <div className="mt-4">
        {loading ? (
          <LoadingBlock />
        ) : listError ? (
          <ErrorBlock message={listError} onRetry={() => void load()} />
        ) : companies.length === 0 ? (
          <EmptyBlock title="暂无公司" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="table-th">公司</th>
                  <th className="table-th">公司 ID</th>
                  <th className="table-th">创建时间</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id}>
                    <td className="table-td font-medium">{company.name}</td>
                    <td className="table-td tabular-nums text-xs text-slate-500">{company.id}</td>
                    <td className="table-td text-xs text-slate-500">{formatDateTime(company.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

// —— 用户档案 ——————————————————————————————————————

export function UsersSection({ companyId }: { companyId: number }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [form, setForm] = useState({ email: '', password: '', display_name: '', department: '', role: 'submitter' as Role })
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<{ user: AdminUser; display_name: string; department: string; role: Role } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setListError('')
    try {
      const { items } = await listUsers(companyId)
      setUsers(items)
    } catch (cause) {
      setListError(describeApiError(cause))
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    setEditing(null)
    void load()
  }, [load])

  const submitCreate = async () => {
    if (!form.email.trim() || !form.password || !form.display_name.trim()) {
      setNotice({ kind: 'error', text: '请填写邮箱、密码与姓名' })
      return
    }
    if (form.password.length < 8) {
      setNotice({ kind: 'error', text: '密码至少 8 位' })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      await createUser({
        email: form.email.trim(),
        password: form.password,
        display_name: form.display_name.trim(),
        company_id: companyId,
        department: form.department.trim() || undefined,
        role: form.role,
      })
      setForm({ email: '', password: '', display_name: '', department: '', role: 'submitter' })
      setNotice({ kind: 'success', text: '用户已创建' })
      await load()
    } catch (cause) {
      setNotice({ kind: 'error', text: describeApiError(cause) })
    } finally {
      setBusy(false)
    }
  }

  const submitUpdate = async () => {
    if (!editing) return
    if (!editing.display_name.trim()) {
      setNotice({ kind: 'error', text: '姓名不能为空' })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      await updateUser(editing.user.user_id, {
        display_name: editing.display_name.trim(),
        department: editing.department.trim(),
        role: editing.role,
      })
      setNotice({ kind: 'success', text: '用户档案已更新' })
      setEditing(null)
      await load()
    } catch (cause) {
      setNotice({ kind: 'error', text: describeApiError(cause) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4">
      <section className="card p-4">
        <h2 className="text-sm font-semibold">新增用户档案</h2>
        <p className="mt-1 text-xs text-slate-500">在同一事务内创建本地登录账户与项目档案；邮箱全局唯一。</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="user-email">
              邮箱
            </label>
            <input
              id="user-email"
              className="input"
              type="email"
              value={form.email}
              onChange={(event) => setForm((previous) => ({ ...previous, email: event.currentTarget.value }))}
              maxLength={320}
            />
          </div>
          <div>
            <label className="label" htmlFor="user-password">
              密码（至少 8 位）
            </label>
            <input
              id="user-password"
              className="input"
              type="password"
              value={form.password}
              onChange={(event) => setForm((previous) => ({ ...previous, password: event.currentTarget.value }))}
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="label" htmlFor="user-name">
              姓名
            </label>
            <input
              id="user-name"
              className="input"
              value={form.display_name}
              onChange={(event) => setForm((previous) => ({ ...previous, display_name: event.currentTarget.value }))}
              maxLength={100}
            />
          </div>
          <div>
            <label className="label" htmlFor="user-department">
              部门（可选）
            </label>
            <input
              id="user-department"
              className="input"
              value={form.department}
              onChange={(event) => setForm((previous) => ({ ...previous, department: event.currentTarget.value }))}
              maxLength={100}
            />
          </div>
          <div>
            <label className="label" htmlFor="user-role">
              角色
            </label>
            <select
              id="user-role"
              className="input"
              value={form.role}
              onChange={(event) => setForm((previous) => ({ ...previous, role: event.currentTarget.value as Role }))}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" className="btn btn-primary w-full" onClick={() => void submitCreate()} disabled={busy}>
              创建用户
            </button>
          </div>
        </div>
        {notice && <div className="mt-3">{<Notice kind={notice.kind} text={notice.text} />}</div>}
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-semibold">用户列表</h2>
        <div className="mt-3">
          {loading ? (
            <LoadingBlock />
          ) : listError ? (
            <ErrorBlock message={listError} onRetry={() => void load()} />
          ) : users.length === 0 ? (
            <EmptyBlock title="该公司暂无用户档案" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="table-th">姓名</th>
                    <th className="table-th">邮箱</th>
                    <th className="table-th">部门</th>
                    <th className="table-th">角色</th>
                    <th className="table-th">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.user_id}>
                      <td className="table-td font-medium">
                        <span className="flex items-center gap-2">
                          <IconUser size={14} className="text-slate-400" />
                          {user.display_name}
                        </span>
                      </td>
                      <td className="table-td text-xs text-slate-500">{user.email}</td>
                      <td className="table-td text-xs">{user.department ?? '—'}</td>
                      <td className="table-td">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="table-td">
                        {editing?.user.user_id === user.user_id ? (
                          <span className="text-xs text-indigo-600">编辑中</span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={() =>
                              setEditing({
                                user,
                                display_name: user.display_name,
                                department: user.department ?? '',
                                role: user.role,
                              })
                            }
                          >
                            编辑
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {editing && (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-600">编辑档案：{editing.user.email}（公司归属不可变更）</h3>
              <button type="button" className="text-slate-400 hover:text-slate-600" onClick={() => setEditing(null)} aria-label="取消编辑">
                <IconX size={14} />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="edit-name">
                  姓名
                </label>
                <input
                  id="edit-name"
                  className="input"
                  value={editing.display_name}
                  maxLength={100}
                  onChange={(event) => setEditing((previous) => (previous ? { ...previous, display_name: event.currentTarget.value } : previous))}
                />
              </div>
              <div>
                <label className="label" htmlFor="edit-department">
                  部门
                </label>
                <input
                  id="edit-department"
                  className="input"
                  value={editing.department}
                  maxLength={100}
                  onChange={(event) => setEditing((previous) => (previous ? { ...previous, department: event.currentTarget.value } : previous))}
                />
              </div>
              <div>
                <label className="label" htmlFor="edit-role">
                  角色
                </label>
                <select
                  id="edit-role"
                  className="input"
                  value={editing.role}
                  onChange={(event) => setEditing((previous) => (previous ? { ...previous, role: event.currentTarget.value as Role } : previous))}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void submitUpdate()} disabled={busy}>
                保存
              </button>
            </div>
          </div>
        )}
      </section>
    </section>
  )
}

// —— 业务组与成员 ——————————————————————————————————————

export function GroupsSection({ companyId }: { companyId: number }) {
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [groupName, setGroupName] = useState('')
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState<{ groupId: number; name: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [addMember, setAddMember] = useState<{ groupId: number; userId: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setListError('')
    try {
      const [groupResult, userResult] = await Promise.all([listBusinessGroups(companyId), listUsers(companyId)])
      setGroups(groupResult.items)
      setUsers(userResult.items)
    } catch (cause) {
      setListError(describeApiError(cause))
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    setRenaming(null)
    setConfirmDelete(null)
    setAddMember(null)
    void load()
  }, [load])

  const submitCreate = async () => {
    if (!groupName.trim()) {
      setNotice({ kind: 'error', text: '请填写业务组名称' })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      await createBusinessGroup({ company_id: companyId, name: groupName.trim() })
      setGroupName('')
      setNotice({ kind: 'success', text: '业务组已创建' })
      await load()
    } catch (cause) {
      setNotice({ kind: 'error', text: describeApiError(cause) })
    } finally {
      setBusy(false)
    }
  }

  const submitRename = async () => {
    if (!renaming) return
    if (!renaming.name.trim()) {
      setNotice({ kind: 'error', text: '业务组名称不能为空' })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      await renameBusinessGroup(renaming.groupId, { name: renaming.name.trim() })
      setRenaming(null)
      setNotice({ kind: 'success', text: '业务组已重命名' })
      await load()
    } catch (cause) {
      setNotice({ kind: 'error', text: describeApiError(cause) })
    } finally {
      setBusy(false)
    }
  }

  const submitDelete = async (groupId: number) => {
    setBusy(true)
    setNotice(null)
    try {
      await deleteBusinessGroup(groupId)
      setConfirmDelete(null)
      setNotice({ kind: 'success', text: '业务组已删除' })
      await load()
    } catch (cause) {
      setNotice({ kind: 'error', text: describeApiError(cause) })
    } finally {
      setBusy(false)
    }
  }

  const submitAddMember = async () => {
    if (!addMember || !addMember.userId) {
      setNotice({ kind: 'error', text: '请选择要添加的成员' })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      await addGroupMember(addMember.groupId, { user_id: Number(addMember.userId) })
      setAddMember(null)
      setNotice({ kind: 'success', text: '成员已添加' })
      await load()
    } catch (cause) {
      setNotice({ kind: 'error', text: describeApiError(cause) })
    } finally {
      setBusy(false)
    }
  }

  const submitRemoveMember = async (groupId: number, userId: number) => {
    setBusy(true)
    setNotice(null)
    try {
      await removeGroupMember(groupId, userId)
      setNotice({ kind: 'success', text: '成员已移除' })
      await load()
    } catch (cause) {
      setNotice({ kind: 'error', text: describeApiError(cause) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4">
      <section className="card p-4">
        <h2 className="text-sm font-semibold">新增业务组</h2>
        <div className="mt-3 flex gap-2">
          <input
            className="input"
            value={groupName}
            onChange={(event) => setGroupName(event.currentTarget.value)}
            placeholder="新业务组名称（1–100 字）"
            maxLength={100}
            aria-label="新业务组名称"
          />
          <button type="button" className="btn btn-primary shrink-0" onClick={() => void submitCreate()} disabled={busy}>
            <IconPlus size={14} />
            创建业务组
          </button>
        </div>
        {notice && <div className="mt-3">{<Notice kind={notice.kind} text={notice.text} />}</div>}
      </section>

      <section className="space-y-3">
        {loading ? (
          <section className="card">
            <LoadingBlock />
          </section>
        ) : listError ? (
          <section className="card">
            <ErrorBlock message={listError} onRetry={() => void load()} />
          </section>
        ) : groups.length === 0 ? (
          <section className="card">
            <EmptyBlock title="该公司暂无业务组" hint="创建业务组后可设置成员与分类分配规则" />
          </section>
        ) : (
          groups.map((group) => {
            const nonMemberUsers = users.filter((user) => !group.members.some((member) => member.user_id === user.user_id))
            return (
              <section key={group.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <IconUsers size={16} className="shrink-0 text-slate-400" />
                    {renaming?.groupId === group.id ? (
                      <span className="flex items-center gap-2">
                        <input
                          className="input h-8 w-48"
                          value={renaming.name}
                          maxLength={100}
                          onChange={(event) => setRenaming({ groupId: group.id, name: event.currentTarget.value })}
                          aria-label="业务组名称"
                        />
                        <button type="button" className="btn btn-primary btn-xs" onClick={() => void submitRename()} disabled={busy}>
                          保存
                        </button>
                        <button type="button" className="btn btn-secondary btn-xs" onClick={() => setRenaming(null)}>
                          取消
                        </button>
                      </span>
                    ) : (
                      <span className="truncate font-semibold">{group.name}</span>
                    )}
                    <span className="text-xs text-slate-400">成员 {group.members.length} 人</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {renaming?.groupId !== group.id && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={() => setRenaming({ groupId: group.id, name: group.name })}
                      >
                        重命名
                      </button>
                    )}
                    {confirmDelete === group.id ? (
                      <span className="flex items-center gap-1.5 text-xs text-rose-600">
                        确认删除？
                        <button type="button" className="btn btn-danger btn-xs" onClick={() => void submitDelete(group.id)} disabled={busy}>
                          删除
                        </button>
                        <button type="button" className="btn btn-secondary btn-xs" onClick={() => setConfirmDelete(null)}>
                          取消
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="btn btn-danger btn-xs" onClick={() => setConfirmDelete(group.id)} disabled={renaming?.groupId === group.id}>
                        <IconTrash size={12} />
                        删除
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  {group.members.length === 0 ? (
                    <p className="text-xs text-slate-400">暂无成员</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                      {group.members.map((member) => (
                        <li key={member.user_id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="min-w-0 text-sm">
                            <span className="font-medium">{member.display_name}</span>
                            <span className="ml-2 text-xs text-slate-400">{member.department ?? '未填写部门'}</span>
                          </span>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs shrink-0"
                            onClick={() => void submitRemoveMember(group.id, member.user_id)}
                            disabled={busy}
                          >
                            移除
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {addMember?.groupId === group.id ? (
                  <div className="mt-3 flex items-center gap-2">
                    <select
                      className="input w-56"
                      value={addMember.userId}
                      onChange={(event) => setAddMember({ groupId: group.id, userId: event.currentTarget.value })}
                      aria-label="选择成员"
                    >
                      <option value="">选择该公司用户</option>
                      {nonMemberUsers.map((user) => (
                        <option key={user.user_id} value={user.user_id}>
                          {user.display_name}（{user.email}）
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn btn-primary btn-xs" onClick={() => void submitAddMember()} disabled={busy}>
                      添加
                    </button>
                    <button type="button" className="btn btn-secondary btn-xs" onClick={() => setAddMember(null)}>
                      取消
                    </button>
                  </div>
                ) : (
                  <div className="mt-3">
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => setAddMember({ groupId: group.id, userId: '' })}
                      disabled={nonMemberUsers.length === 0}
                      title={nonMemberUsers.length === 0 ? '该公司所有用户均已在组内' : undefined}
                    >
                      <IconPlus size={12} />
                      添加成员
                    </button>
                  </div>
                )}
              </section>
            )
          })
        )}
      </section>
    </section>
  )
}

// —— 分配规则 ——————————————————————————————————————

export function RulesSection({ companyId }: { companyId: number }) {
  const [rules, setRules] = useState<AssignmentRule[]>([])
  const [groups, setGroups] = useState<BusinessGroup[]>([])
  const [category, setCategory] = useState<string>(BASELINE_CATEGORIES[0])
  const [groupId, setGroupId] = useState('')
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setListError('')
    try {
      const [ruleResult, groupResult] = await Promise.all([listAssignmentRules(companyId), listBusinessGroups(companyId)])
      setRules(ruleResult.items)
      setGroups(groupResult.items)
    } catch (cause) {
      setListError(describeApiError(cause))
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    setGroupId('')
    void load()
  }, [load])

  const submitUpsert = async () => {
    if (!groupId) {
      setNotice({ kind: 'error', text: '请选择目标业务组' })
      return
    }
    setBusy(true)
    setNotice(null)
    try {
      await upsertAssignmentRule({ company_id: companyId, category, group_id: Number(groupId) })
      setNotice({ kind: 'success', text: `规则已保存：${category} → ${groups.find((group) => String(group.id) === groupId)?.name ?? ''}` })
      await load()
    } catch (cause) {
      setNotice({ kind: 'error', text: describeApiError(cause) })
    } finally {
      setBusy(false)
    }
  }

  const submitDelete = async (ruleId: number) => {
    setBusy(true)
    setNotice(null)
    try {
      await deleteAssignmentRule(ruleId)
      setNotice({ kind: 'success', text: '规则已删除' })
      await load()
    } catch (cause) {
      setNotice({ kind: 'error', text: describeApiError(cause) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4">
      <section className="card p-4">
        <h2 className="text-sm font-semibold">配置分配规则</h2>
        <p className="mt-1 text-xs text-slate-500">按（公司, 分类）保存映射；命中规则的新工单自动分配到对应业务组并进入待处理。</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="rule-category">
              问题分类
            </label>
            <select id="rule-category" className="input" value={category} onChange={(event) => setCategory(event.currentTarget.value)}>
              {BASELINE_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="rule-group">
              目标业务组
            </label>
            <select id="rule-group" className="input" value={groupId} onChange={(event) => setGroupId(event.currentTarget.value)}>
              <option value="">请选择业务组</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" className="btn btn-primary w-full" onClick={() => void submitUpsert()} disabled={busy}>
              保存规则
            </button>
          </div>
        </div>
        {notice && <div className="mt-3">{<Notice kind={notice.kind} text={notice.text} />}</div>}
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-semibold">规则列表</h2>
        <div className="mt-3">
          {loading ? (
            <LoadingBlock />
          ) : listError ? (
            <ErrorBlock message={listError} onRetry={() => void load()} />
          ) : rules.length === 0 ? (
            <EmptyBlock title="该公司暂无分配规则" hint="未命中规则的新工单将保持待分配，可手动分配" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="table-th">问题分类</th>
                    <th className="table-th">分配到业务组</th>
                    <th className="table-th">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id}>
                      <td className="table-td font-medium">{rule.category}</td>
                      <td className="table-td">{rule.group_name}</td>
                      <td className="table-td">
                        <button type="button" className="btn btn-danger btn-xs" onClick={() => void submitDelete(rule.id)} disabled={busy}>
                          <IconTrash size={12} />
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </section>
  )
}
