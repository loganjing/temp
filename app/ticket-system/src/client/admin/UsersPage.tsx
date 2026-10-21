// 用户管理（admin）：用户开户与业务档案维护（契约第 2 节）。
// 认证凭证由服务端 userkit 存储；本页仅负责业务档案（姓名、邮箱、公司、部门、角色）。
import { useState, type FormEvent } from 'react'
import { createUser, listUsers, updateUserProfile } from '../api/users'
import { listCompanies } from '../api/org'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  inputClass,
  PageHeader,
  Spinner,
  SuccessNote,
  TableSkeleton,
} from '../components/ui'
import { IconPencil, IconPlus, IconUsers, IconX } from '../components/icons'
import { roleLabel } from '../contracts/labels'
import { errorMessage, useAsync } from '../hooks/useAsync'
import type { Role, UserItem } from '../contracts/types'

const PAGE_SIZE = 20
const ROLE_OPTIONS: Role[] = ['submitter', 'agent', 'admin', 'viewer']

export default function UsersPage() {
  const [page, setPage] = useState(1)
  const [companyFilter, setCompanyFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const companies = useAsync(() => listCompanies(), [])
  const users = useAsync(
    () => listUsers({ page, pageSize: PAGE_SIZE, companyId: companyFilter ? Number(companyFilter) : undefined }),
    [page, companyFilter],
  )

  const [create, setCreate] = useState({
    username: '',
    password: '',
    displayName: '',
    email: '',
    companyId: '',
    department: '',
    role: 'submitter' as Role,
  })
  const [createBusy, setCreateBusy] = useState(false)

  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [edit, setEdit] = useState({
    displayName: '',
    email: '',
    companyId: '',
    department: '',
    role: 'submitter' as Role,
  })
  const [editBusy, setEditBusy] = useState(false)

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const companyId = Number(create.companyId)
    if (!Number.isInteger(companyId) || companyId <= 0) {
      setError('请选择所属公司')
      return
    }
    setCreateBusy(true)
    setError('')
    setNotice('')
    try {
      const user = await createUser({
        username: create.username.trim(),
        password: create.password,
        displayName: create.displayName.trim(),
        email: create.email.trim(),
        companyId,
        department: create.department.trim(),
        role: create.role,
      })
      setCreate({
        username: '',
        password: '',
        displayName: '',
        email: '',
        companyId: '',
        department: '',
        role: 'submitter',
      })
      setNotice(`用户「${user.displayName}」已创建`)
      users.reload()
    } catch (cause) {
      setError(errorMessage(cause, '创建用户失败'))
    } finally {
      setCreateBusy(false)
    }
  }

  const startEdit = (user: UserItem) => {
    setEditingUserId(user.userId)
    setEdit({
      displayName: user.displayName,
      email: user.email,
      companyId: String(user.companyId),
      department: user.department,
      role: (ROLE_OPTIONS.includes(user.role as Role) ? user.role : 'submitter') as Role,
    })
    setError('')
    setNotice('')
  }

  const submitEdit = async (event: FormEvent<HTMLFormElement>, userId: number) => {
    event.preventDefault()
    const companyId = Number(edit.companyId)
    if (!Number.isInteger(companyId) || companyId <= 0) {
      setError('请选择所属公司')
      return
    }
    setEditBusy(true)
    setError('')
    setNotice('')
    try {
      const user = await updateUserProfile(userId, {
        displayName: edit.displayName.trim(),
        email: edit.email.trim(),
        companyId,
        department: edit.department.trim(),
        role: edit.role,
      })
      setEditingUserId(null)
      setNotice(`用户「${user.displayName}」的业务档案已更新`)
      users.reload()
    } catch (cause) {
      setError(errorMessage(cause, '更新档案失败'))
    } finally {
      setEditBusy(false)
    }
  }

  const data = users.data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const companyOptions = companies.data?.items ?? []
  const companyName = (id: number) => companyOptions.find((company) => company.id === id)?.name

  return (
    <div>
      <PageHeader
        title="用户管理"
        description="开户并维护用户业务档案（姓名、邮箱、公司、部门、角色）"
        actions={
          <Button onClick={() => setFormOpen((open) => !open)}>
            <IconPlus />
            {formOpen ? '收起表单' : '创建用户'}
          </Button>
        }
      />

      {formOpen && (
        <Card title="创建用户" className="mb-6" description="用户名与密码为登录凭证；密码至少 8 位">
          <form onSubmit={submitCreate} className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="用户名" required hint="3-64 字，唯一">
              <input
                className={inputClass}
                required
                minLength={3}
                maxLength={64}
                value={create.username}
                onChange={(event) => setCreate({ ...create, username: event.currentTarget.value })}
              />
            </Field>
            <Field label="初始密码" required hint="至少 8 位">
              <input
                className={inputClass}
                type="password"
                required
                minLength={8}
                value={create.password}
                onChange={(event) => setCreate({ ...create, password: event.currentTarget.value })}
              />
            </Field>
            <Field label="姓名" required hint="1-64 字">
              <input
                className={inputClass}
                required
                maxLength={64}
                value={create.displayName}
                onChange={(event) => setCreate({ ...create, displayName: event.currentTarget.value })}
              />
            </Field>
            <Field label="邮箱" required>
              <input
                className={inputClass}
                type="email"
                required
                value={create.email}
                onChange={(event) => setCreate({ ...create, email: event.currentTarget.value })}
              />
            </Field>
            <Field label="所属公司" required>
              <select
                className={inputClass}
                required
                value={create.companyId}
                onChange={(event) => setCreate({ ...create, companyId: event.currentTarget.value })}
              >
                <option value="">选择公司</option>
                {companyOptions.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="部门" hint="0-64 字">
              <input
                className={inputClass}
                maxLength={64}
                value={create.department}
                onChange={(event) => setCreate({ ...create, department: event.currentTarget.value })}
              />
            </Field>
            <Field label="业务角色" required>
              <select
                className={inputClass}
                value={create.role}
                onChange={(event) => setCreate({ ...create, role: event.currentTarget.value as Role })}
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role)}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="submit" disabled={createBusy}>
              {createBusy ? <Spinner /> : <IconPlus />}
              创建用户
            </Button>
          </form>
        </Card>
      )}

      <Card
        title={`用户列表（${data?.total ?? 0}）`}
        actions={
          <div className="flex items-center gap-2">
            <select
              className={`${inputClass} w-44`}
              aria-label="按公司过滤"
              value={companyFilter}
              onChange={(event) => {
                setCompanyFilter(event.currentTarget.value)
                setPage(1)
              }}
            >
              <option value="">全部公司</option>
              {companyOptions.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
        }
        bodyClassName="pt-2"
      >
        <ErrorBanner message={users.error ?? error} />
        <SuccessNote message={notice || null} />
        {users.loading && !data ? (
          <TableSkeleton rows={6} cols={5} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<IconUsers className="size-5" />}
            title="没有符合条件的用户"
            description="调整公司过滤条件，或创建新用户。"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="px-3 py-2.5 font-medium">用户名</th>
                  <th className="px-3 py-2.5 font-medium">姓名</th>
                  <th className="px-3 py-2.5 font-medium">邮箱</th>
                  <th className="px-3 py-2.5 font-medium">公司</th>
                  <th className="px-3 py-2.5 font-medium">部门</th>
                  <th className="px-3 py-2.5 font-medium">角色</th>
                  <th className="px-3 py-2.5 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((user) => (
                  <tr key={user.userId} className="align-top">
                    {editingUserId === user.userId ? (
                      <td colSpan={7} className="px-3 py-3">
                        <form
                          onSubmit={(event) => void submitEdit(event, user.userId)}
                          className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5"
                        >
                          <Field label="姓名">
                            <input
                              className={inputClass}
                              maxLength={64}
                              required
                              value={edit.displayName}
                              onChange={(event) => setEdit({ ...edit, displayName: event.currentTarget.value })}
                            />
                          </Field>
                          <Field label="邮箱">
                            <input
                              className={inputClass}
                              type="email"
                              required
                              value={edit.email}
                              onChange={(event) => setEdit({ ...edit, email: event.currentTarget.value })}
                            />
                          </Field>
                          <Field label="所属公司">
                            <select
                              className={inputClass}
                              required
                              value={edit.companyId}
                              onChange={(event) => setEdit({ ...edit, companyId: event.currentTarget.value })}
                            >
                              <option value="">选择公司</option>
                              {companyOptions.map((company) => (
                                <option key={company.id} value={company.id}>
                                  {company.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="部门">
                            <input
                              className={inputClass}
                              maxLength={64}
                              value={edit.department}
                              onChange={(event) => setEdit({ ...edit, department: event.currentTarget.value })}
                            />
                          </Field>
                          <Field label="业务角色">
                            <select
                              className={inputClass}
                              value={edit.role}
                              onChange={(event) => setEdit({ ...edit, role: event.currentTarget.value as Role })}
                            >
                              {ROLE_OPTIONS.map((role) => (
                                <option key={role} value={role}>
                                  {roleLabel(role)}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <div className="flex gap-2 lg:col-span-5">
                            <Button type="submit" disabled={editBusy}>
                              {editBusy ? <Spinner /> : null}
                              保存档案
                            </Button>
                            <Button variant="ghost" onClick={() => setEditingUserId(null)}>
                              <IconX />
                              取消
                            </Button>
                          </div>
                        </form>
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-slate-600">{user.username}</td>
                        <td className="px-3 py-2.5 text-slate-800">{user.displayName}</td>
                        <td className="max-w-56 px-3 py-2.5">
                          <span className="block truncate text-slate-600" title={user.email}>
                            {user.email}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {companyName(user.companyId) ?? user.companyName}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{user.department || '—'}</td>
                        <td className="px-3 py-2.5">
                          <Badge tone="bg-slate-100 text-slate-600 ring-slate-300">
                            {roleLabel(user.role)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <Button variant="ghost" onClick={() => startEdit(user)} aria-label="编辑档案">
                            <IconPencil className="size-4" />
                            编辑
                          </Button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > data.pageSize && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm text-slate-500">
            <span>
              第 {data.page} / {totalPages} 页 · 共 {data.total} 条
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                上一页
              </Button>
              <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                下一页
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
